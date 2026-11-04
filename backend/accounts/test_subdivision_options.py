from datetime import date
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from .models import Blueprint, Lot, ReservationRequest, SaleTransaction, Subdivision, User


class MapSubdivisionOptionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create(username='options-admin', role='admin')
        self.manager = User.objects.create(username='options-manager', role='manager')
        self.published = Subdivision.objects.create(name='Current project')
        self.draft = Subdivision.objects.create(name='Draft project')
        self.legacy = Subdivision.objects.create(name='Historical project')
        Blueprint.objects.create(title=self.published.name, status='published')
        Blueprint.objects.create(title=self.draft.name, status='draft')

    def options(self, user):
        self.client.force_authenticate(user)
        response = self.client.get('/api/subdivisions/', {'compact': 'true', 'map_selectable': 'true'})
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_options_follow_map_role_visibility_without_requiring_available_lots(self):
        self.assertEqual(self.options(self.manager), [{'id': self.published.pk, 'name': self.published.name}])
        self.assertEqual({row['id'] for row in self.options(self.admin)}, {self.published.pk, self.draft.pk})
        for user in (self.admin, self.manager):
            self.client.force_authenticate(user)
            # Exercise list visibility without signing image URLs externally.
            with patch('accounts.views.blueprint_response_data', side_effect=lambda row: {'title': row.title}):
                maps = self.client.get('/api/blueprints/').data
            self.assertEqual({row['name'] for row in self.options(user)}, {row['title'] for row in maps})

    def test_duplicate_map_titles_do_not_duplicate_options(self):
        Blueprint.objects.create(title=self.published.name, status='published')
        self.assertEqual(len(self.options(self.manager)), 1)

    def test_blank_title_matches_existing_sync_fallback_without_creating_records(self):
        fallback = Subdivision.objects.create(name='Subdivision Blueprint')
        Blueprint.objects.create(title='', status='published')
        before = Subdivision.objects.count()
        self.assertIn({'id': fallback.pk, 'name': fallback.name}, self.options(self.manager))
        self.assertEqual(Subdivision.objects.count(), before)

    def test_historical_analytics_and_unfiltered_compact_api_are_preserved(self):
        buyer = User.objects.create(username='options-buyer', role='client')
        lot = Lot.objects.create(subdivision=self.legacy, block='A', lot_number=1, area=100, status='sold')
        reservation = ReservationRequest.objects.create(lot=lot, client=buyer, status='approved')
        SaleTransaction.objects.create(lot=lot, reservation=reservation, client=buyer,
            project=self.legacy.name, sale_date=date(2025, 1, 1), total_contract_price=100)
        self.assertNotIn(self.legacy.pk, [row['id'] for row in self.options(self.admin)])
        all_options = self.client.get('/api/subdivisions/?compact=true').data
        self.assertIn(self.legacy.pk, [row['id'] for row in all_options])
        all_analytics = self.client.get('/api/analytics/reservations/').data
        self.assertEqual(all_analytics['summary']['total_reservations'], 1)
        self.assertEqual(all_analytics['summary']['completed_sales_from_reservations'], 1)
        historical = self.client.get('/api/analytics/reservations/', {'subdivision_id': self.legacy.pk}).data
        self.assertEqual(historical['summary'], all_analytics['summary'])
        self.assertEqual(self.client.get('/api/sales-analytics/').data['summary']['total_sales'], 1)
