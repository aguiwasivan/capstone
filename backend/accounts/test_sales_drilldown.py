from datetime import date
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User, Lot, Subdivision, ReservationRequest, SaleTransaction


class SalesDrilldownTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(username='admin-scope', role='admin')
        self.manager = User.objects.create(username='manager-scope', role='manager')
        self.other_manager = User.objects.create(username='manager-other', role='manager')
        self.agent = User.objects.create(username='agent-one', role='agent')
        self.other_agent = User.objects.create(username='agent-two', role='agent')
        self.zero_agent = User.objects.create(username='agent-zero', role='agent')
        self.buyer = User.objects.create(username='buyer', first_name='Buyer', last_name='One', role='client')
        self.broker = User.objects.create(username='broker', role='broker')
        self.subdivision = Subdivision.objects.create(name='Scope Village')
        self.lot = Lot.objects.create(subdivision=self.subdivision, block='B', lot_number=7, area=120)
        self.own = SaleTransaction.objects.create(agent=self.agent, manager=self.manager, broker=self.broker,
            client=self.buyer, lot=self.lot, project='Scope Village', sale_date=date(2026, 1, 2), total_contract_price=1000)
        SaleTransaction.objects.create(agent=self.agent, manager=self.other_manager, client=self.buyer,
            lot=self.lot, project='Scope Village', sale_date=date(2026, 1, 3), total_contract_price=2000)
        SaleTransaction.objects.create(agent=self.other_agent, manager=self.manager, project='Scope Village',
            sale_date=date(2026, 2, 2), total_contract_price=3000)
        ReservationRequest.objects.create(assigned_agent=self.zero_agent, client=self.buyer, lot=self.lot, status='approved')
        self.api = APIClient()

    def test_manager_scope_matches_report_and_details(self):
        self.api.force_authenticate(self.manager)
        report = self.api.get('/api/sales-report/').data
        analytics = self.api.get('/api/analytics/top-performing-agents/').data
        rows = {row['user_id']: row for row in analytics['performance_data']}
        self.assertEqual(report['summary']['total_sales'], 2)
        self.assertEqual(analytics['summary']['total_completed_sales'], 2)
        self.assertEqual(analytics['summary']['total_sales_amount'], 4000)
        self.assertEqual(rows[self.agent.id]['completed_sales'], 1)
        self.assertEqual(rows[self.other_agent.id]['completed_sales'], 1)
        self.assertEqual(rows[self.zero_agent.id]['completed_sales'], 0)
        detail = self.api.get('/api/analytics/top-performing-agents/', {'details': 1, 'user_id': self.agent.id}).data['transactions']
        self.assertEqual([sale['id'] for sale in detail], [self.own.id])
        self.assertEqual(detail[0]['manager_name'], 'manager-scope')
        self.assertEqual(detail[0]['broker_name'], 'broker')
        self.assertEqual(detail[0]['client_name'], 'Buyer One')
        self.assertEqual((detail[0]['subdivision_name'], detail[0]['block_number'], detail[0]['lot_number'], detail[0]['lot_area']), ('Scope Village', 'B', 7, 120))
        self.assertEqual(detail[0]['transaction_status'], 'Completed')
        self.assertEqual(self.api.get('/api/sales-analytics/').data['summary']['total_sales'], 2)

    def test_admin_date_filter_and_access(self):
        self.api.force_authenticate(self.admin)
        params = {'start_date': '2026-01-01', 'end_date': '2026-01-02'}
        analytics = self.api.get('/api/analytics/top-performing-agents/', params).data
        self.assertEqual(analytics['summary']['total_completed_sales'], 1)
        params.update({'details': 1, 'user_id': self.agent.id})
        self.assertEqual([x['id'] for x in self.api.get('/api/analytics/top-performing-agents/', params).data['transactions']], [self.own.id])
        for user in (self.agent, self.buyer, self.broker):
            self.api.force_authenticate(user)
            self.assertEqual(self.api.get('/api/analytics/top-performing-agents/', params).status_code, 403)
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get('/api/analytics/top-performing-agents/', params).status_code, 401)

    def test_manager_conversion_excludes_other_managers_sales(self):
        reservation = ReservationRequest.objects.create(assigned_agent=self.agent, client=self.buyer,
            lot=self.lot, status='approved')
        SaleTransaction.objects.create(agent=self.agent, manager=self.other_manager, reservation=reservation,
            client=self.buyer, lot=self.lot, project='Scope Village', sale_date=date(2026, 1, 4), total_contract_price=250)
        self.api.force_authenticate(self.manager)
        data = self.api.get('/api/analytics/top-performing-agents/').data
        row = next(row for row in data['performance_data'] if row['user_id'] == self.agent.id)
        self.assertEqual(row['reservations_handled'], 1)
        self.assertEqual(row['conversion_rate'], 0)
