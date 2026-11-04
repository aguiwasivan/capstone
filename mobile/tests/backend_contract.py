from accounts.models import Lot, ReservationRequest, Subdivision, User
from rest_framework.test import APITestCase


class MobileContractTests(APITestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(username='mobile-buyer', password='mobile-password-123', role='client')
        self.admin = User.objects.create_user(username='mobile-admin', password='mobile-password-123', role='admin')
        self.lot = Lot.objects.create(subdivision=Subdivision.objects.create(name='Mobile contract'), block='1', lot_number=1, area=100, price=500000)

    def test_existing_accounts_in_every_role_can_login_and_refresh(self):
        for role in ['client', 'agent', 'manager', 'broker', 'admin']:
            username = f'mobile-login-{role}'
            User.objects.create_user(username=username, password='mobile-password-123', role=role)
            response = self.client.post('/api/login/', {'username': username, 'password': 'mobile-password-123'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['user']['role'], role)
            refreshed = self.client.post('/api/token/refresh/', {'refresh': response.data['refresh']})
            self.assertEqual(refreshed.status_code, 200)

    def test_web_mark_reserved_is_visible_to_mobile_and_blocks_request(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'/api/lots/{self.lot.id}/reserve/').status_code, 200)
        self.client.force_authenticate(self.buyer)
        lot = next(item for item in self.client.get('/api/lots/').data if item['id'] == self.lot.id)
        self.assertEqual(lot['status'], 'reserved')
        self.assertEqual(self.client.post('/api/reservation-requests/', {'lot_id': self.lot.id}).status_code, 400)

    def test_mobile_request_and_staff_approval_share_same_records(self):
        self.client.force_authenticate(self.buyer)
        created = self.client.post('/api/reservation-requests/', {'lot_id': self.lot.id})
        self.assertEqual(created.status_code, 201)
        self.client.force_authenticate(self.admin)
        self.assertIn(created.data['id'], [row['id'] for row in self.client.get('/api/reservation-requests/').data])
        self.assertEqual(self.client.post(f"/api/reservation-requests/{created.data['id']}/approve/").status_code, 200)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get('/api/reservation-requests/').data[0]['status'], 'approved')
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.status, 'reserved')

    def test_client_reservations_remain_private(self):
        other = User.objects.create_user(username='other-mobile-buyer', role='client')
        reservation = ReservationRequest.objects.create(client=other, lot=self.lot)
        self.client.force_authenticate(self.buyer)
        self.assertNotIn(reservation.id, [row['id'] for row in self.client.get('/api/reservation-requests/').data])
        self.assertEqual(self.client.post(f'/api/reservation-requests/{reservation.id}/approve/').status_code, 403)
