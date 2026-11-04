from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Lot, Subdivision, User, ReservationRequest, SaleTransaction
from accounts.views import build_reservation_analytics, build_top_performing_agents_analytics, build_agent_sales_pipeline_forecast
from sales.views import build_model_comparison_response


class AnalyticsAuditTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(username='audit-admin', role='admin')
        self.agent = User.objects.create(username='audit-agent', role='agent')
        self.other = User.objects.create(username='audit-other-agent', role='agent')
        self.client_user = User.objects.create(username='audit-client', role='client')
        self.project = Subdivision.objects.create(name='Audit subdivision')
        self.lot = Lot.objects.create(subdivision=self.project, block='A', lot_number=1, area=100, price=100)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def sale(self, **kwargs):
        return SaleTransaction.objects.create(project=self.project.name, total_contract_price=100,
            sale_date=kwargs.pop('sale_date', date(2026, 1, 15)), agent=kwargs.pop('agent', self.agent), **kwargs)

    def reservation(self, when, **kwargs):
        row = ReservationRequest.objects.create(lot=self.lot, client=self.client_user, **kwargs)
        ReservationRequest.objects.filter(pk=row.pk).update(created_at=when)
        return row

    def test_sales_permissions_and_scope(self):
        own = self.sale(agent=self.agent)
        self.sale(agent=self.other)
        for user, code in ((None, 401), (self.client_user, 403), (self.agent, 200)):
            self.client.force_authenticate(user)
            for endpoint in ('sales-transactions/', 'sales-analytics/', 'sales-predictions/'):
                self.assertEqual(self.client.get('/api/' + endpoint).status_code, code)
        self.assertEqual([row['id'] for row in self.client.get('/api/sales-transactions/').data], [own.id])
        self.assertEqual(self.client.get('/api/sales-analytics/').data['summary']['total_sales'], 1)
        self.assertEqual(self.client.get('/api/sales-report/').status_code, 403)

    def test_filters_reject_bad_dates_ids_statuses_and_reversed_ranges(self):
        for endpoint in ('analytics/reservations/', 'analytics/top-performing-agents/', 'analytics/agent-sales-pipeline-forecast/'):
            for params in ({'start_date': 'bad'}, {'end_date': '2026-02-30'}, {'year': 'no'},
                           {'subdivision_id': 'bad'}, {'user_id': '-1'}, {'status': 'bad'},
                           {'start_date': '2026-02-01', 'end_date': '2026-01-01'}):
                with self.subTest(endpoint=endpoint, params=params):
                    self.assertEqual(self.client.get('/api/' + endpoint, params).status_code, 400)

    @override_settings(TIME_ZONE='Asia/Manila')
    def test_date_boundaries_use_reporting_timezone_and_end_date_is_inclusive(self):
        self.reservation(datetime(2026, 1, 31, 15, 59, tzinfo=dt_timezone.utc))
        self.reservation(datetime(2026, 1, 31, 16, 0, tzinfo=dt_timezone.utc))
        jan = build_reservation_analytics({'start_date': '2026-01-31', 'end_date': '2026-01-31'})
        feb = build_reservation_analytics({'start_date': '2026-02-01', 'end_date': '2026-02-01'})
        self.assertEqual(jan['summary']['total_reservations'], 1)
        self.assertEqual(feb['summary']['total_reservations'], 1)

    def test_conversion_uses_one_legacy_request_and_does_not_duplicate_explicit_links(self):
        older = self.reservation(datetime(2026, 1, 1, tzinfo=dt_timezone.utc), status='approved')
        latest = self.reservation(datetime(2026, 1, 2, tzinfo=dt_timezone.utc), status='approved')
        self.reservation(datetime(2026, 1, 3, tzinfo=dt_timezone.utc), status='declined')
        self.sale(lot=self.lot, client=self.client_user)
        self.assertEqual(build_reservation_analytics({})['summary']['completed_sales_from_reservations'], 1)
        self.sale(lot=self.lot, client=self.client_user, reservation=older)
        self.sale(lot=self.lot, client=self.client_user, reservation=older)
        payload = build_reservation_analytics({})
        self.assertEqual(payload['summary']['total_reservations'], 3)
        self.assertEqual(payload['summary']['completed_sales_from_reservations'], 2)
        self.assertEqual(payload['summary']['conversion_rate'], 66.67)

    def test_top_lots_filter_precedes_top_ten_and_blocks_stay_separate(self):
        other = Subdivision.objects.create(name='Other audit subdivision')
        for number in range(11):
            lot = Lot.objects.create(subdivision=other, block='A', lot_number=number + 1, area=100)
            for _ in range(2):
                ReservationRequest.objects.create(lot=lot, client=self.client_user)
        ReservationRequest.objects.create(lot=self.lot, client=self.client_user)
        all_data = build_reservation_analytics({})
        self.assertEqual(len(all_data['most_reserved_blocks_phases']), 2)
        filtered = build_reservation_analytics({'subdivision_id': str(self.project.pk)})
        self.assertEqual(filtered['most_reserved_lots'][0]['lot_id'], self.lot.pk)
        self.assertEqual(filtered['summary']['total_reservations'], 1)

    def test_agent_metrics_do_not_invent_missing_denominators_or_commission_status(self):
        self.sale(agent=self.agent, agent_commission=5)
        self.sale(agent=self.other, agent_commission=7)
        data = build_top_performing_agents_analytics({'user_id': str(self.agent.pk)})
        self.assertEqual(data['summary']['total_sales_amount'], 100)
        self.assertEqual(len(data['agent_options']), 2)
        row = data['performance_data'][0]
        self.assertIsNone(row['conversion_rate'])
        self.assertEqual(row['reservations_handled'], 0)
        self.assertIsNone(row['pending_commission'])
        self.assertEqual(row['commission_earned'], 5)
        self.assertEqual(data['top_conversion_performers'], [])

    def test_pipeline_reports_actual_unconverted_count_without_fake_projection(self):
        self.reservation(datetime(2026, 1, 1, tzinfo=dt_timezone.utc), status='approved')
        data = build_agent_sales_pipeline_forecast({})
        self.assertFalse(data['model_available'])
        self.assertEqual(data['summary']['total_active_approved_reservations'], 1)
        self.assertIsNone(data['summary']['total_projected_pipeline_value'])
        self.assertEqual(build_agent_sales_pipeline_forecast({'reservation_status': 'pending'})['summary']['total_active_approved_reservations'], 0)

    def test_detail_lot_score_matches_subdivision_list(self):
        Lot.objects.create(subdivision=self.project, block='A', lot_number=2, area=200, price=200)
        listed = self.client.get('/api/analytics/lot-demand/', {'subdivision_id': self.project.pk}).data
        detail = self.client.get(f'/api/analytics/lot-demand/{self.lot.pk}/').data
        self.assertEqual(detail['prediction']['demand_score'], next(row['demand_score'] for row in listed['predictions'] if row['lot_id'] == self.lot.pk))

    @patch('sales.views.timezone.localdate', return_value=date(2026, 9, 15))
    def test_forecast_excludes_incomplete_future_months_and_includes_trailing_zero_months(self, clock):
        for month in range(1, 7):
            self.sale(sale_date=date(2026, month, 1))
        self.sale(sale_date=date(2026, 9, 1))
        self.sale(sale_date=date(2026, 12, 1))
        with patch('sales.views.random_forest_predict_value', return_value=Decimal(100)) as predict:
            data = build_model_comparison_response(SaleTransaction.objects.all())
        self.assertEqual(data['model_comparison']['next_period'], '2026-09')
        self.assertEqual(data['model_comparison']['line_chart'][-2]['period'], '2026-08')
        self.assertEqual(predict.call_args_list[0].args[0][-2:], [0, 0])
        self.assertEqual(sum(row['total_sales'] for row in data['history']), 8)
