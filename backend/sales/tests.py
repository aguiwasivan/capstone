from datetime import date
from decimal import Decimal
from unittest.mock import patch

from rest_framework.test import APITestCase

from accounts.models import SaleTransaction, User
from .views import random_forest_predict_value, walk_forward_validation, _cached_random_forest_predict_value


class SalesForecastViewTests(APITestCase):
    def setUp(self):
        _cached_random_forest_predict_value.cache_clear()

    def test_identical_inputs_reuse_prediction_and_changed_inputs_retrain(self):
        from sales.views import RandomForestRegressor
        with patch('sales.views.RandomForestRegressor', wraps=RandomForestRegressor) as model:
            values = list(range(6))
            first = random_forest_predict_value(values)
            self.assertEqual(first, random_forest_predict_value(values))
            self.assertEqual(model.call_count, 1)
            values[-1] = 100
            random_forest_predict_value(values)
            self.assertEqual(model.call_count, 2)

    def test_long_validation_uses_latest_year_without_future_data(self):
        seen = []
        values = list(range(60))
        def predict(prefix):
            seen.append(prefix)
            return prefix[-1]
        metrics = walk_forward_validation(values, predict)
        self.assertEqual(metrics['validation_points'], 12)
        self.assertEqual(seen, [values[:index] for index in range(48, 60)])

    def history(self, count=8):
        return [
            {'month': f'2025-{month:02d}', 'total_sales': 100000 * month}
            for month in range(1, count + 1)
        ]

    def test_forecast_uses_real_random_forest(self):
        response = self.client.post('/api/sales/forecast/', self.history(), format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['model'], 'Random Forest')
        self.assertEqual(response.data['formula']['lag_months'], 3)
        self.assertEqual(response.data['formula']['n_estimators'], 100)
        self.assertGreater(response.data['predicted_next_month'], 0)
        self.assertEqual(response.data['trend'], 'decreasing')
        self.assertNotIn('damped_trend', response.data['formula'])

    def test_forecast_rejects_insufficient_history(self):
        for count in [1, 2, 5]:
            with self.subTest(months=count):
                response = self.client.post('/api/sales/forecast/', self.history(count), format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn('6 months', response.data['detail'])

    def test_invalid_numeric_values_are_rejected(self):
        for value in ['NaN', 'Infinity', '-Infinity', '-1', 'bad']:
            with self.subTest(value=value):
                rows = self.history()
                rows[0]['total_sales'] = value
                response = self.client.post('/api/sales/forecast/', rows, format='json')
                self.assertEqual(response.status_code, 400)

    def test_duplicate_or_missing_months_are_rejected(self):
        for month in ['2025-01', '2025-10', '2025-2']:
            rows = self.history()
            rows[1]['month'] = month
            response = self.client.post('/api/sales/forecast/', rows, format='json')
            self.assertEqual(response.status_code, 400)

    def test_repeatable_and_zero_predictions(self):
        values = [Decimal(row['total_sales']) for row in self.history()]
        self.assertEqual(random_forest_predict_value(values), random_forest_predict_value(values))
        self.assertEqual(random_forest_predict_value([0] * 6), 0)

    def test_validation_only_uses_past_observations(self):
        seen = []

        def predict(values):
            seen.append(list(values))
            return values[-1]

        values = list(range(8))
        metrics = walk_forward_validation(values, predict)
        self.assertEqual(seen, [values[:6], values[:7]])
        self.assertEqual(metrics['validation_points'], 2)
        self.assertEqual(metrics['mae'], '1.00')

    @patch('sales.views.RandomForestRegressor', None)
    def test_missing_dependency_returns_no_prediction(self):
        response = self.client.post('/api/sales/forecast/', self.history(), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Random Forest', response.data['detail'])


class SalesPredictionAnalyticsTests(APITestCase):
    def setUp(self):
        clock = patch('sales.views.timezone.localdate', return_value=date(2025, 9, 1))
        clock.start()
        self.addCleanup(clock.stop)
        self.agent = User.objects.create(username='forecast-agent', role='agent')
        self.other_agent = User.objects.create(username='other-agent', role='agent')
        for month in range(1, 9):
            SaleTransaction.objects.create(
                agent=self.agent, project='Forecast project', sale_date=date(2025, month, 1),
                total_contract_price=month * 100000, agent_commission=month * 1000,
            )
        SaleTransaction.objects.create(
            agent=self.other_agent, project='Other project', sale_date=date(2025, 1, 1),
            total_contract_price=9999999,
        )
        self.client.force_authenticate(self.agent)

    def test_prediction_cache_tracks_database_changes_and_analytics_stays_current(self):
        _cached_random_forest_predict_value.cache_clear()
        first = self.client.get('/api/sales-predictions/').data
        misses = _cached_random_forest_predict_value.cache_info().misses
        self.assertEqual(first, self.client.get('/api/sales-predictions/').data)
        self.assertEqual(_cached_random_forest_predict_value.cache_info().misses, misses)
        SaleTransaction.objects.filter(agent=self.agent, sale_date__month=8).update(total_contract_price=900000)
        changed = self.client.get('/api/sales-predictions/').data
        self.assertEqual(changed['history'][-1]['total_contract_price'], '900000.00')
        self.assertGreater(_cached_random_forest_predict_value.cache_info().misses, misses)
        analytics = self.client.get('/api/sales-analytics/')
        self.assertEqual(analytics.status_code, 200)
        self.assertEqual(analytics.data['summary']['total_sales'], 8)
        self.assertEqual(analytics.data['summary']['total_contract_price'], Decimal('3700000'))

    def test_chart_metrics_and_forecast_use_random_forest_and_respect_scope(self):
        response = self.client.get('/api/sales-predictions/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        comparison = data['model_comparison']
        self.assertEqual(comparison['selected_model'], 'random_forest')
        self.assertEqual(comparison['selected_model_label'], 'Random Forest')
        self.assertEqual(comparison['metrics']['random_forest']['validation_points'], 2)
        self.assertNotIn('damped_holt', comparison['metrics'])
        self.assertEqual(data['history'][0]['total_contract_price'], '100000.00')
        self.assertEqual(comparison['line_chart'][-1]['period'], '2025-09')
        self.assertIsNotNone(comparison['line_chart'][-1]['random_forest'])
        self.assertGreater(Decimal(data['forecast'][0]['predicted_agent_commission']), 0)

    def test_missing_database_month_is_zero_filled(self):
        SaleTransaction.objects.filter(agent=self.agent, sale_date__month=4).delete()
        data = self.client.get('/api/sales-predictions/').data
        self.assertEqual(data['history'][3]['period'], '2025-04')
        self.assertEqual(data['history'][3]['total_contract_price'], '0.00')

    @patch('sales.views.timezone.localdate', return_value=date(2025, 6, 1))
    def test_short_history_returns_limitation_and_no_fake_forecast(self, clock):
        SaleTransaction.objects.filter(agent=self.agent, sale_date__month__gt=5).delete()
        data = self.client.get('/api/sales-predictions/').data
        self.assertEqual(data['forecast'], [])
        self.assertIsNone(data['model_comparison']['selected_model'])
        self.assertIn('6 completed monthly', data['data_limitation_message'])
