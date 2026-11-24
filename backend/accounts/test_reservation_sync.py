"""Read performance and two-way contract tests; run with backend.test_settings only."""
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from .models import Blueprint, BlueprintLot, Lot, ReservationRequest, Subdivision, User
from .views import LotListView, ReservationRequestListCreateView, ReservationRequestApproveView, BlueprintLotsListView


class ReservationSyncTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create(username='sync-admin', role='admin')
        cls.client_user = User.objects.create(username='sync-client', role='client')
        cls.other_client = User.objects.create(username='sync-other', role='client')
        cls.agent = User.objects.create(username='sync-agent', role='agent')
        cls.subdivision = Subdivision.objects.create(name='Sync test')
        cls.blueprint = Blueprint.objects.create(title='Sync test', status='published')
        cls.points = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]
        for number in range(1, 13):
            lot = Lot.objects.create(subdivision=cls.subdivision, block='A', lot_number=number, area=100)
            BlueprintLot.objects.create(blueprint=cls.blueprint, block_number='A', lot_number=str(number),
                description='Preserve description', category='Inner', coordinates=cls.points, polygon_coordinates=cls.points)
            ReservationRequest.objects.create(lot=lot, client=cls.client_user, assigned_agent=cls.agent,
                reviewed_by=cls.admin, status='approved')
        ReservationRequest.objects.create(lot=lot, client=cls.other_client)

    def call(self, view, method='get', data=None, user=None, **kwargs):
        request = getattr(APIRequestFactory(), method)('/', data, format='json')
        force_authenticate(request, user or self.admin)
        return view.as_view()(request, **kwargs)

    def test_lots_use_two_queries_and_preserve_reserved_details(self):
        with self.assertNumQueries(2):
            response = self.call(LotListView, data={'subdivision_id': self.subdivision.pk})
            self.assertEqual(len(response.data), 12)
            self.assertEqual(response.data[0]['subdivision_name'], 'Sync test')
            self.assertEqual(response.data[0]['reserved_client_name'], 'sync-client')
            self.assertEqual(response.data[0]['reserved_reviewed_by_name'], 'sync-admin')

    def test_reservations_use_two_queries_with_nested_details(self):
        with self.assertNumQueries(2):
            response = self.call(ReservationRequestListCreateView)
            self.assertEqual(len(response.data), 13)
            self.assertEqual(response.data[0]['lot']['subdivision_name'], 'Sync test')
        assigned = next(row for row in response.data if row['assigned_agent'])
        self.assertEqual(assigned['assigned_agent_name'], 'sync-agent')
        self.assertEqual(assigned['lot']['reserved_client_name'], 'sync-client')

    def test_client_scope_and_reviewer_permissions_unchanged(self):
        response = self.call(ReservationRequestListCreateView, user=self.client_user)
        self.assertEqual(len(response.data), 12)
        self.assertTrue(all(row['client'] == self.client_user.pk for row in response.data))
        reservation = ReservationRequest.objects.first()
        for user in (self.client_user, self.agent):
            response = self.call(ReservationRequestApproveView, 'post', {}, user=user, pk=reservation.pk)
            self.assertEqual(response.status_code, 403)

    def test_mobile_approval_is_visible_in_website_blueprint_read(self):
        reservation = ReservationRequest.objects.filter(status='pending').get()
        response = self.call(ReservationRequestApproveView, 'post', {}, pk=reservation.pk)
        self.assertEqual(response.status_code, 200)
        response = self.call(BlueprintLotsListView, pk=self.blueprint.pk)
        mapped = next(row for row in response.data if row['lot_number'] == str(reservation.lot.lot_number))
        self.assertEqual(mapped['status'], 'reserved')
        self.assertEqual(mapped['description'], 'Preserve description')
        self.assertEqual(mapped['category'], 'Inner')
        self.assertEqual(mapped['coordinates'], self.points)

    def test_saved_website_correction_is_visible_in_mobile_reads(self):
        # Use fresh isolated inventory with no transaction history to preserve precedence rules.
        lot = Lot.objects.create(subdivision=self.subdivision, block='B', lot_number=115, area=100)
        mapped = BlueprintLot.objects.create(blueprint=self.blueprint, block_number='B', lot_number='115',
            description='Unchanged', category='Inner', coordinates=self.points, polygon_coordinates=self.points)
        response = self.call(BlueprintLotsListView, 'patch', {'updates': [{'id': str(mapped.pk), 'status': 'reserved'}]}, pk=self.blueprint.pk)
        self.assertEqual(response.status_code, 200)
        lot.refresh_from_db()
        self.assertEqual(lot.status, 'reserved')
        response = self.call(LotListView, data={'subdivision_id': self.subdivision.pk})
        self.assertEqual(next(row for row in response.data if row['id'] == lot.pk)['status'], 'reserved')
        mapped.refresh_from_db()
        self.assertEqual(mapped.description, 'Unchanged')
        self.assertEqual(mapped.coordinates, self.points)

class BlueprintMembershipTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create(username='membership-admin', role='admin')
        cls.client_user = User.objects.create(username='membership-client', role='client')
        cls.agent = User.objects.create(username='membership-agent', role='agent')
        cls.published = Blueprint.objects.create(title='Membership', status='published')
        cls.draft = Blueprint.objects.create(title='Private draft', status='draft')
        cls.points = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]
        cls.mapped = BlueprintLot.objects.create(blueprint=cls.published, block_number='B', lot_number='115',
            description='Keep', category='Inner', coordinates=cls.points, polygon_coordinates=cls.points)
        BlueprintLot.objects.create(blueprint=cls.draft, block_number='A', lot_number='107')
        subdivision = Subdivision.objects.create(name='Unrelated manual inventory')
        Lot.objects.create(subdivision=subdivision, block='X', lot_number=999, area=100)

    def request(self, view, user, method='get', data=None, **kwargs):
        request = getattr(APIRequestFactory(), method)('/', data, format='json')
        force_authenticate(request, user)
        return view.as_view()(request, **kwargs)

    def test_nested_uuid_membership_and_existing_visibility_policy(self):
        from unittest.mock import patch
        from .serializers import BlueprintSerializer
        from .views import BlueprintListView
        # Isolate visibility/serialization from storage URL generation and external services.
        with patch('accounts.views.blueprint_response_data', side_effect=lambda blueprint: BlueprintSerializer(blueprint).data):
            for user in (self.client_user, self.agent):
                with self.assertNumQueries(2):
                    response = self.request(BlueprintListView, user)
                self.assertEqual([str(row['id']) for row in response.data], [str(self.published.pk)])
                self.assertEqual(len(response.data[0]['lots']), 1)
                lot = response.data[0]['lots'][0]
                self.assertEqual(str(lot['id']), str(self.mapped.pk))
                self.assertEqual(str(lot['blueprint']), str(self.published.pk))
            response = self.request(BlueprintListView, self.admin)
            self.assertEqual({str(row['id']) for row in response.data}, {str(self.published.pk), str(self.draft.pk)})

    def test_mobile_blueprint_uuid_uses_existing_reservation_flow_without_duplicates(self):
        response = self.request(ReservationRequestListCreateView, self.client_user, 'post', {'lot_id': str(self.mapped.pk)})
        self.assertEqual(response.status_code, 201, response.data)
        reservation_id = response.data['id']
        self.assertEqual(response.data['lot']['status'], 'pending')
        retry = self.request(ReservationRequestListCreateView, self.client_user, 'post', {'lot_id': str(self.mapped.pk)})
        self.assertEqual(retry.status_code, 400)
        self.assertEqual(ReservationRequest.objects.filter(client=self.client_user).count(), 1)
        response = self.request(ReservationRequestApproveView, self.admin, 'post', {}, pk=reservation_id)
        self.assertEqual(response.status_code, 200)
        response = self.request(BlueprintLotsListView, self.client_user, pk=self.published.pk)
        self.assertEqual(str(response.data[0]['id']), str(self.mapped.pk))
        self.assertEqual(response.data[0]['status'], 'reserved')
        self.assertEqual(response.data[0]['coordinates'], self.points)
        self.assertEqual(response.data[0]['description'], 'Keep')

    def test_unpublished_blueprint_members_cannot_be_requested_by_clients(self):
        draft_lot = BlueprintLot.objects.get(blueprint=self.draft)
        response = self.request(ReservationRequestListCreateView, self.client_user, 'post', {'lot_id': str(draft_lot.pk)})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ReservationRequest.objects.count(), 0)
