from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from .models import Blueprint, BlueprintLot, User
from .views import BlueprintLotsListView, BlueprintLotDetailView
from .analytics_sync import sync_blueprint_lot


class OptionalLotDetailsTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = User.objects.create(username='polygon-admin', role='admin')
        self.blueprint = Blueprint.objects.create(title='Test map')
        self.points = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]

    def call(self, view, method, data, pk):
        request = getattr(self.factory, method)('/', data, format='json')
        force_authenticate(request, self.admin)
        return view.as_view()(request, pk=pk)

    def test_polygon_first_and_details_later(self):
        response = self.call(BlueprintLotsListView, 'post', {'coordinates': self.points}, self.blueprint.pk)
        self.assertEqual(response.status_code, 201, response.data)
        lot = BlueprintLot.objects.get(pk=response.data['id'])
        self.assertEqual(lot.lot_number, '')
        self.assertIsNone(lot.area_sqm)
        self.assertIsNone(lot.price)
        self.assertEqual(lot.coordinates, self.points)
        self.assertIsNone(sync_blueprint_lot(lot))
        for payload in [{'status': 'reserved'}, {'category': 'Residential'}, {'lot_number': '30'}]:
            response = self.call(BlueprintLotDetailView, 'patch', payload, lot.pk)
            self.assertEqual(response.status_code, 200, response.data)
        lot.refresh_from_db()
        self.assertEqual(lot.coordinates, self.points)
        self.assertEqual(lot.status, 'reserved')
        self.assertEqual(lot.category, 'Residential')
        self.assertEqual(lot.model, '')
        response = self.call(BlueprintLotDetailView, 'patch', {'lot_number': None, 'category': None, 'location_url': None}, lot.pk)
        self.assertEqual(response.status_code, 200, response.data)
        lot.refresh_from_db()
        self.assertEqual(lot.lot_number, '')
        self.assertEqual(lot.category, '')
        self.assertEqual(lot.location_url, '')
        moved = [[0.3, 0.3], [0.4, 0.3], [0.4, 0.4]]
        response = self.call(BlueprintLotDetailView, 'patch', {'polygon_coordinates': moved}, lot.pk)
        self.assertEqual(response.status_code, 200, response.data)
        lot.refresh_from_db()
        self.assertEqual(lot.coordinates, moved)

    def test_geometry_required_and_ids_unique(self):
        response = self.call(BlueprintLotsListView, 'post', {}, self.blueprint.pk)
        self.assertEqual(response.status_code, 400)
        ids = [self.call(BlueprintLotsListView, 'post', {'coordinates': self.points}, self.blueprint.pk).data['id'] for _ in range(2)]
        self.assertNotEqual(*ids)
