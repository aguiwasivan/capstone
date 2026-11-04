from uuid import uuid4
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from .models import Blueprint, BlueprintLot, Lot, User
from .views import BlueprintLotsListView
from .analytics_sync import sync_blueprint_lot


class BlueprintCorrectionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(username='correction-admin', role='admin')
        self.blueprint = Blueprint.objects.create(title='Corrections')
        self.points = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]
        self.a = BlueprintLot.objects.create(blueprint=self.blueprint, lot_number='1', block_number='A', description='Keep me', coordinates=self.points)
        self.b = BlueprintLot.objects.create(blueprint=self.blueprint, lot_number='2', block_number='A', coordinates=self.points)

    def patch(self, data, user=None):
        request = APIRequestFactory().patch('/', data, format='json')
        force_authenticate(request, user or self.admin)
        return BlueprintLotsListView.as_view()(request, pk=self.blueprint.pk)

    def test_multiple_partial_updates_and_persistent_response(self):
        response = self.patch({'updates': [{'id': str(self.a.pk), 'status': 'reserved'}, {'id': str(self.b.pk), 'coordinates': self.points, 'description': ''}]})
        self.assertEqual(response.status_code, 200, response.data)
        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertEqual(self.a.status, 'reserved')
        self.assertEqual(self.a.description, 'Keep me')
        self.assertEqual(self.b.polygon_coordinates, self.points)
        self.assertEqual(BlueprintLot.objects.count(), 2)

    def test_invalid_batch_changes_nothing(self):
        response = self.patch({'updates': [{'id': str(self.a.pk), 'status': 'sold'}, {'id': str(self.b.pk), 'status': 'invalid'}]})
        self.assertEqual(response.status_code, 400)
        self.a.refresh_from_db()
        self.assertEqual(self.a.status, 'available')

    def test_atomic_rollback_after_save_on_inventory_collision(self):
        self.blueprint.status = 'published'
        self.blueprint.save()
        sync_blueprint_lot(self.a)
        sync_blueprint_lot(self.b)
        response = self.patch({'updates': [{'id': str(self.a.pk), 'description': 'Changed'}, {'id': str(self.b.pk), 'lot_number': '1'}]})
        self.assertEqual(response.status_code, 400)
        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertEqual(self.a.description, 'Keep me')
        self.assertEqual(self.b.lot_number, '2')

    def test_renumber_preserves_inventory_id(self):
        self.blueprint.status = 'published'
        self.blueprint.save()
        inventory = sync_blueprint_lot(self.a)
        response = self.patch({'updates': [{'id': str(self.a.pk), 'lot_number': '3'}]})
        self.assertEqual(response.status_code, 200, response.data)
        inventory.refresh_from_db()
        self.assertEqual(inventory.lot_number, 3)
        self.assertEqual(Lot.objects.filter(subdivision=inventory.subdivision).count(), 1)

    def test_create_delete_empty_details_and_duplicate_retry(self):
        key = str(uuid4())
        payload = {'creates': [{'id': key, 'coordinates': self.points}], 'deletes': [str(self.b.pk)]}
        response = self.patch(payload)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(BlueprintLot.objects.get(pk=key).description, '')
        self.assertEqual(self.patch(payload).status_code, 400)
        self.assertEqual(BlueprintLot.objects.count(), 2)

    def test_scope_and_permissions(self):
        outsider = BlueprintLot.objects.create(blueprint=Blueprint.objects.create(title='Other'))
        self.assertEqual(self.patch({'updates': [{'id': str(outsider.pk), 'status': 'sold'}]}).status_code, 400)
        agent = User.objects.create(username='agent', role='agent')
        self.assertEqual(self.patch({}, user=agent).status_code, 403)
