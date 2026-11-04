"""Representative API timings against an isolated test database, never production."""
from datetime import date
from decimal import Decimal
from statistics import median
from time import perf_counter
from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import Lot, ReservationRequest, SaleTransaction, Subdivision, User
from sales.views import _cached_random_forest_predict_value


class AnalyticsPerformanceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create(username='perf-admin', role='admin')
        client = User.objects.create(username='perf-client', role='client')
        agents = User.objects.bulk_create([User(username=f'perf-agent-{i}', role='agent') for i in range(8)])
        projects = Subdivision.objects.bulk_create([Subdivision(name=f'Performance {i}') for i in range(2)])
        lots = Lot.objects.bulk_create([
            Lot(subdivision=projects[i % 2], block=str(i % 4), lot_number=i + 1,
                price=100000 + i * 500, area=100, location_zone=['front', 'central', 'rear'][i % 3])
            for i in range(40)
        ])
        reservations = ReservationRequest.objects.bulk_create([
            ReservationRequest(lot=lots[i % 40], client=client, assigned_agent=agents[i % 8],
                               status=['pending', 'approved', 'declined', 'cancelled'][i % 4])
            for i in range(1200)
        ])
        SaleTransaction.objects.bulk_create([
            SaleTransaction(agent=agents[i % 8], client=client, lot=lots[i % 40],
                reservation=reservations[i], project=projects[i % 2].name,
                sale_date=date(2024 + (i % 24) // 12, (i % 24) % 12 + 1, 1),
                total_contract_price=Decimal(100000 + i * 100), agent_commission=Decimal(1000 + i))
            for i in range(120)
        ])

    def test_representative_endpoints(self):
        api = APIClient()
        api.force_authenticate(self.admin)
        for path in ('sales-analytics/', 'analytics/reservations/', 'analytics/top-performing-agents/',
                     'analytics/agent-sales-pipeline-forecast/',
                     'analytics/lot-demand/?subdivision_id=1', 'sales-predictions/?period=monthly'):
            _cached_random_forest_predict_value.cache_clear()
            times, queries = [], []
            with patch('sales.views.timezone.localdate', return_value=date(2026, 1, 1)):
                for _ in range(3):
                    with CaptureQueriesContext(connection) as captured:
                        start = perf_counter()
                        response = api.get('/api/' + path)
                        times.append(perf_counter() - start)
                    queries.append(len(captured))
                    self.assertEqual(response.status_code, 200, path)
            print(f'BENCH {path}: cold={times[0]:.4f}s warm_median={median(times[1:]):.4f}s queries={queries}')
