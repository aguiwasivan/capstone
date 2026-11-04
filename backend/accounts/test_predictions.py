from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import User, Lot, Subdivision, ReservationRequest, SaleTransaction, LotDemandObservation, AnalyticsPredictionModel
from .views import build_top_performing_agents_analytics, build_agent_sales_pipeline_forecast, build_lot_demand_payload
from .demand_prediction import capture_observations, readiness, train_model, features_for, model_predictions, MODEL_KEY


class PredictionTests(TestCase):
    def test_compact_subdivision_options_skip_lots_and_blueprints(self):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/subdivisions/?compact=true')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(set(row) == {'id', 'name'} for row in response.data))
        self.assertEqual(len(queries), 1)
        self.assertNotIn('blueprint_data', queries[0]['sql'])

    def test_demand_queries_do_not_fetch_image_payloads(self):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        with CaptureQueriesContext(connection) as queries:
            payload = build_lot_demand_payload(subdivision_id=self.project.pk)
        self.assertEqual(payload['summary']['available_lots'], 1)
        for query in queries:
            self.assertNotIn('blueprint_data', query['sql'])
            self.assertNotIn('photo_data', query['sql'])

    def setUp(self):
        Lot.objects.all().delete()
        self.admin = User.objects.create(username='prediction-admin', role='admin')
        self.agent = User.objects.create(username='prediction-agent', role='agent')
        self.buyer = User.objects.create(username='prediction-buyer', role='client')
        self.project = Subdivision.objects.create(name='Prediction project')
        self.lot = Lot.objects.create(subdivision=self.project, block='1', lot_number=1, area=100, price=1000)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def request(self, **kwargs):
        return ReservationRequest.objects.create(lot=self.lot, client=self.buyer, **kwargs)

    def sale(self, request):
        return SaleTransaction.objects.create(reservation=request, lot=self.lot, client=self.buyer,
            agent=self.agent, project=self.project.name, total_contract_price=1000, sale_date=timezone.localdate())

    def test_assignment_permissions_validation_and_clear(self):
        request = self.request(status='approved')
        url = f'/api/reservation-requests/{request.pk}/agent/'
        for user, code in ((None, 401), (self.buyer, 403), (self.agent, 403)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.patch(url, {'assigned_agent': self.agent.pk}).status_code, code)
        self.client.force_authenticate(self.admin)
        for value in ('invalid', self.buyer.pk, -1):
            self.assertEqual(self.client.patch(url, {'assigned_agent': value}).status_code, 400)
        response = self.client.patch(url, {'assigned_agent': self.agent.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['assigned_agent'], self.agent.pk)
        self.assertEqual(self.client.patch(url, {'assigned_agent': None}, format='json').status_code, 200)
        self.sale(request)
        self.assertEqual(self.client.patch(url, {'assigned_agent': self.agent.pk}).status_code, 400)

    def test_pipeline_uses_resolved_outcomes_excludes_converted_and_preserves_unassigned(self):
        converted = self.request(status='approved', assigned_agent=self.agent)
        self.sale(converted)
        self.request(status='declined', assigned_agent=self.agent)
        self.request(status='approved', assigned_agent=self.agent)
        self.request(status='approved')
        self.request(status='pending', assigned_agent=self.agent)
        data = build_agent_sales_pipeline_forecast({})
        self.assertTrue(data['model_available'])
        self.assertEqual(data['summary']['total_active_approved_reservations'], 2)
        self.assertEqual(data['summary']['unassigned_reservations'], 1)
        self.assertEqual(data['summary']['total_projected_pipeline_value'], 1000)
        self.assertEqual(data['agent_pipeline_forecasts'][0]['conversion_probability'], .5)
        filtered = build_agent_sales_pipeline_forecast({'user_id': str(self.agent.pk)})
        self.assertEqual(filtered['summary']['total_active_approved_reservations'], 1)
        self.assertEqual(filtered['summary']['total_projected_pipeline_value'], 500)
        self.assertEqual(build_agent_sales_pipeline_forecast({'reservation_status': 'pending'})['agent_pipeline_forecasts'], [])

    def test_conversion_denominator_is_assigned_requests_not_direct_sales(self):
        converted = self.request(status='approved', assigned_agent=self.agent)
        self.sale(converted)
        self.request(status='declined', assigned_agent=self.agent)
        self.request(status='approved')
        self.sale(None)
        data = build_top_performing_agents_analytics({})
        self.assertEqual(data['summary']['total_reservations_handled'], 2)
        self.assertEqual(data['summary']['overall_conversion_rate'], 50)
        self.assertEqual(data['performance_data'][0]['conversion_rate'], 50)

    def test_observations_capture_once_daily_and_do_not_invent_outcomes(self):
        capture_observations()
        capture_observations()
        self.assertEqual(LotDemandObservation.objects.filter(lot=self.lot).count(), 1)
        status, _, _ = readiness()
        self.assertFalse(status['can_train'])
        self.assertEqual(status['valid_observations'], 0)
        self.assertEqual(status['pending_observations'], 1)
        response = self.client.post('/api/analytics/lot-demand/train/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['model_available'])
        self.assertEqual(build_lot_demand_payload()['mode'], 'demand_score')

    def test_training_validates_later_outcomes_and_serves_persisted_probabilities(self):
        now = timezone.now()
        for i in range(40):
            lot = Lot.objects.create(subdivision=self.project, block='2', lot_number=i+1,
                                     area=100 if i < 20 else 1000, price=1000 if i < 20 else 1000000)
            for days in (120, 60):
                observed = now-timedelta(days=days)
                LotDemandObservation.objects.create(lot=lot, observed_at=observed,
                    observed_date=observed.date(), features=features_for(lot))
                if i < 20:
                    row = ReservationRequest.objects.create(lot=lot, client=self.buyer)
                    ReservationRequest.objects.filter(pk=row.pk).update(created_at=observed+timedelta(days=10))
        status = train_model()
        self.assertTrue(status['can_train'])
        self.assertEqual(status['evaluation']['training_samples'], 40)
        model, probabilities = model_predictions([self.lot])
        self.assertIsNotNone(model)
        self.assertGreater(probabilities[self.lot.pk], .5)
        payload = build_lot_demand_payload(subdivision_id=self.project.pk)
        self.assertTrue(payload['model_available'])
        self.assertEqual(payload['mode'], 'ml_probability')
        for row in payload['predictions']:
            self.assertEqual(row['demand_score'], round(row['demand_probability']*100, 2))

    def test_future_requests_cannot_label_an_immature_observation(self):
        observation = LotDemandObservation.objects.create(lot=self.lot, observed_at=timezone.now()-timedelta(days=5),
            observed_date=timezone.localdate()-timedelta(days=5), features=features_for(self.lot))
        self.request()
        self.assertEqual(readiness()[0]['valid_observations'], 0)

    def test_sale_uses_assigned_agent(self):
        from sales.serializers import SaleTransactionSerializer
        reservation = self.request(status='approved', assigned_agent=self.agent)
        serializer = SaleTransactionSerializer(data={'reservation': reservation.pk, 'project': self.project.name,
            'total_contract_price': '1000', 'sale_date': str(timezone.localdate())})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.save().agent_id, self.agent.pk)

    def test_migration_backfill_uses_only_unambiguous_linked_sales(self):
        from importlib import import_module
        from django.apps import apps
        from django.db import connection
        simple = self.request(status='approved')
        ambiguous = self.request(status='approved')
        self.sale(simple)
        self.sale(ambiguous)
        other = User.objects.create(username='second-prediction-agent', role='agent')
        sale = self.sale(ambiguous)
        sale.agent = other
        sale.save()
        module = import_module('accounts.migrations.0022_analyticspredictionmodel_and_more')
        from types import SimpleNamespace
        module.assign_linked_reservations(apps, SimpleNamespace(connection=connection))
        simple.refresh_from_db()
        ambiguous.refresh_from_db()
        self.assertEqual(simple.assigned_agent_id, self.agent.pk)
        self.assertIsNone(ambiguous.assigned_agent_id)
