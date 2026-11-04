from datetime import date

from django.test import TestCase, TransactionTestCase
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from rest_framework.test import APIClient

from .analytics_sync import sync_blueprint_lot
from .location_demand import distribution_by_zone
from .models import Blueprint, BlueprintLot, Lot, ReservationRequest, SaleTransaction, Subdivision, User
from .views import build_lot_demand_payload


class LocationDemandTests(TestCase):
    def setUp(self):
        Lot.objects.all().delete()
        self.subdivision = Subdivision.objects.create(name='Zone test subdivision')
        self.other = Subdivision.objects.create(name='Separate zone test subdivision')
        self.admin = User.objects.create(username='zone-admin', role='admin')
        self.manager = User.objects.create(username='zone-manager', role='manager')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.lot = Lot.objects.create(subdivision=self.subdivision, block='1', lot_number=1, area=100, price=500)

    def endpoint(self, subdivision=None):
        return self.client.get('/api/analytics/lot-demand/', {'subdivision_id': (subdivision or self.subdivision).id})

    def test_admin_assignment_persists_and_invalid_or_unauthorized_edits_fail(self):
        self.assertEqual(self.lot.location_zone, 'unassigned')
        url = f'/api/lots/{self.lot.id}/'
        response = self.client.patch(url, {'location_zone': 'front'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.location_zone, 'front')
        self.assertEqual(self.endpoint().data['predictions'][0]['location_zone'], 'front')
        self.assertEqual(self.client.patch(url, {'location_zone': 'side'}, format='json').status_code, 400)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.patch(url, {'location_zone': 'rear'}, format='json').status_code, 403)
        self.assertEqual(self.endpoint().status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.patch(url, {'location_zone': 'rear'}, format='json').status_code, 401)

    def test_blueprint_editor_assignment_syncs_and_survives_future_sync(self):
        blueprint = Blueprint.objects.create(title=self.subdivision.name, status='published')
        polygon = BlueprintLot.objects.create(blueprint=blueprint, block_number='1', lot_number='1')
        url = f'/api/lots/{polygon.id}/'
        self.assertEqual(self.client.patch(url, {'location_zone': 'central'}, format='json').status_code, 200)
        polygon.refresh_from_db()
        self.lot.refresh_from_db()
        self.assertEqual(polygon.location_zone, 'central')
        self.assertEqual(self.lot.location_zone, 'central')

        self.client.patch(f'/api/lots/{self.lot.id}/', {'location_zone': 'rear'}, format='json')
        polygon.refresh_from_db()
        sync_blueprint_lot(polygon)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.location_zone, 'rear')
        self.assertEqual(self.client.patch(url, {'location_zone': 'invalid'}, format='json').status_code, 400)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.patch(url, {'location_zone': 'front'}, format='json').status_code, 403)

    def test_create_polygon_zone_is_validated_and_defaulted(self):
        blueprint = Blueprint.objects.create(title='Zone draft')
        url = f'/api/blueprints/{blueprint.id}/lots/'
        data = {'lot_number': '1', 'coordinates': [[0, 0], [1, 0], [1, 1]]}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['location_zone'], 'unassigned')
        data['location_zone'] = 'front'
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(BlueprintLot.objects.get(pk=response.data['id']).location_zone, 'front')
        data['location_zone'] = 'side'
        self.assertEqual(self.client.post(url, data, format='json').status_code, 400)

    def test_subdivision_isolates_inventory_and_scoring_inputs(self):
        ReservationRequest.objects.create(lot=self.lot, client=self.admin)
        baseline = self.endpoint().data
        other_lot = Lot.objects.create(subdivision=self.other, block='1', lot_number=1, area=900, price=999999, location_zone='front')
        for _ in range(5):
            ReservationRequest.objects.create(lot=other_lot, client=self.admin)
            SaleTransaction.objects.create(lot=other_lot, project=self.other.name, sale_date=date.today(), total_contract_price=900)
        result = self.endpoint().data
        self.assertEqual(result['predictions'], baseline['predictions'])
        self.assertEqual(result['distribution_by_zone'], baseline['distribution_by_zone'])
        self.assertEqual(result['summary']['available_lots'], 1)
        self.assertEqual(result['score_scale']['max'], 100)
        self.assertEqual(result['mode'], 'demand_score')
        self.assertIsNone(result['predictions'][0]['demand_probability'])
        self.assertEqual(self.endpoint(self.other).data['predictions'][0]['lot_id'], other_lot.id)
        self.assertEqual(build_lot_demand_payload()['distribution_by_zone'], [])

    def test_zone_does_not_change_score_and_averages_match_actual_scores(self):
        baseline = self.endpoint().data['predictions'][0]['demand_score']
        self.lot.location_zone = 'front'
        self.lot.save()
        Lot.objects.create(subdivision=self.subdivision, block='2', lot_number=2, area=100, price=100, location_zone='front')
        Lot.objects.create(subdivision=self.subdivision, block='3', lot_number=3, area=100, status='sold', location_zone='rear')
        result = self.endpoint().data
        self.assertEqual(next(row for row in result['predictions'] if row['lot_id'] == self.lot.id)['demand_score'], baseline)
        front, central, rear, unassigned = result['distribution_by_zone']
        self.assertEqual(front['available_lots'], 2)
        self.assertEqual(front['scored_lots'], 2)
        self.assertEqual(front['average_score'], sum(row['demand_score'] for row in result['predictions']) / 2)
        for row in (central, rear, unassigned):
            self.assertEqual(row['available_lots'], 0)
            self.assertIsNone(row['average_score'])

    def test_missing_scores_are_excluded_but_zero_is_scored(self):
        rows = [{'location_zone': 'front', 'lot_status': 'available', 'demand_score': value}
                for value in (None, 0, 60, float('nan'))]
        rows.append({'location_zone': 'rear', 'lot_status': 'available'})
        rows.append({'location_zone': 'front', 'lot_status': 'sold', 'demand_score': 100})
        front, central, rear, unassigned = distribution_by_zone(rows)
        self.assertEqual((front['available_lots'], front['scored_lots'], front['average_score']), (4, 2, 30))
        self.assertEqual(rear['available_lots'], 1)
        self.assertEqual(rear['scored_lots'], 0)
        self.assertIsNone(rear['average_score'])
        self.assertIsNone(central['average_score'])

    def test_empty_subdivision_and_invalid_selection(self):
        result = self.endpoint(self.other)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['predictions'], [])
        self.assertTrue(all(row['average_score'] is None for row in result.data['distribution_by_zone']))
        self.assertEqual(self.client.get('/api/analytics/lot-demand/?subdivision_id=bad').status_code, 400)
        self.assertEqual(self.client.get('/api/analytics/lot-demand/?subdivision_id=999999').status_code, 404)

    def test_bulk_edit_preserves_omitted_zone_and_rejects_invalid_zone(self):
        self.lot.location_zone = 'rear'
        self.lot.save()
        data = {'blueprint_lots': [{'id': self.lot.id, 'block': '1', 'lot_number': 1,
                'polygon_points': [{'x': 0, 'y': 0}, {'x': 1, 'y': 0}, {'x': 1, 'y': 1}]}]}
        url = f'/api/subdivisions/{self.subdivision.id}/lots/'
        self.assertEqual(self.client.put(url, data, format='json').status_code, 200)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.location_zone, 'rear')
        data['blueprint_lots'][0]['location_zone'] = 'side'
        self.assertEqual(self.client.put(url, data, format='json').status_code, 400)
        data['blueprint_lots'][0]['location_zone'] = 'central'
        self.assertEqual(self.client.put(url, data, format='json').status_code, 200)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.location_zone, 'central')


class LocationZoneMigrationTests(TransactionTestCase):
    def test_existing_records_default_to_unassigned(self):
        previous = [('accounts', '0020_lot_location_url_blueprintlot_location_url')]
        current = [('accounts', '0021_lot_location_zone')]
        executor = MigrationExecutor(connection)
        executor.migrate(previous)
        try:
            apps = executor.loader.project_state(previous).apps
            old_lot = apps.get_model('accounts', 'Lot').objects.create(block='migration', lot_number=1, area=100)
            old_blueprint = apps.get_model('accounts', 'Blueprint').objects.create(title='Migration test')
            old_polygon = apps.get_model('accounts', 'BlueprintLot').objects.create(blueprint=old_blueprint, lot_number='1')
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
        self.assertEqual(Lot.objects.get(pk=old_lot.pk).location_zone, 'unassigned')
        self.assertEqual(BlueprintLot.objects.get(pk=old_polygon.pk).location_zone, 'unassigned')
