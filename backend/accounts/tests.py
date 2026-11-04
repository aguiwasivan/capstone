from datetime import date
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from .analytics_sync import sync_blueprint_lot, sync_published_blueprint
from .models import Blueprint, BlueprintLot, Lot, ReservationRequest, SaleTransaction, User
from .views import build_lot_demand_payload, build_reservation_analytics


class AnalyticsSyncTests(TestCase):
    def setUp(self):
        Lot.objects.all().delete()
        self.blueprint = Blueprint.objects.create(title='Test subdivision', status='published')
        self.map_lot = BlueprintLot.objects.create(
            blueprint=self.blueprint, block_number='1', lot_number='Lot 1',
            area_sqm=100, price=500000,
        )

    def test_published_inventory_is_in_demand_and_sync_is_idempotent(self):
        sync_published_blueprint(self.blueprint)
        sync_published_blueprint(self.blueprint)
        self.assertEqual(Lot.objects.count(), 1)
        payload = build_lot_demand_payload()
        self.assertEqual(payload['summary']['available_lots'], 1)
        self.assertEqual(payload['predictions'][0]['price'], 500000)
        self.map_lot.price = 600000
        self.map_lot.save()
        sync_blueprint_lot(self.map_lot)
        self.assertEqual(Lot.objects.get().price, 600000)

    def test_transaction_status_survives_stale_map(self):
        lot = sync_blueprint_lot(self.map_lot)
        client = User.objects.create(username='buyer')
        reservation = ReservationRequest.objects.create(lot=lot, client=client, status='approved')
        sync_blueprint_lot(self.map_lot)
        lot.refresh_from_db()
        self.assertEqual(lot.status, 'reserved')
        SaleTransaction.objects.create(
            lot=lot, client=client, reservation=reservation,
            project='Test subdivision', sale_date=date.today(), total_contract_price=500000,
        )
        sync_blueprint_lot(self.map_lot)
        lot.refresh_from_db()
        self.assertEqual(lot.status, 'sold')
        self.assertEqual(build_lot_demand_payload()['summary']['available_lots'], 0)
        self.assertEqual(build_reservation_analytics({})['summary']['completed_sales_from_reservations'], 1)

    def test_drafts_and_open_spaces_are_not_inventory(self):
        self.map_lot.status = 'open_space'
        self.assertIsNone(sync_blueprint_lot(self.map_lot))
        self.map_lot.status = 'available'
        self.blueprint.status = 'draft'
        self.assertIsNone(sync_blueprint_lot(self.map_lot))
        self.assertFalse(Lot.objects.exists())

    def test_ambiguous_map_numbers_are_not_silently_merged(self):
        BlueprintLot.objects.create(
            blueprint=self.blueprint, block_number='1', lot_number='01', area_sqm=200,
        )
        self.assertEqual(sync_published_blueprint(self.blueprint), 0)
        self.assertFalse(Lot.objects.exists())

    def test_backfill_dry_run_and_repeat(self):
        call_command('sync_analytics', dry_run=True, stdout=StringIO())
        self.assertFalse(Lot.objects.exists())
        call_command('sync_analytics', stdout=StringIO())
        call_command('sync_analytics', stdout=StringIO())
        self.assertEqual(Lot.objects.count(), 1)

    def test_subdivision_totals_include_more_than_top_ten_lots(self):
        lot = sync_blueprint_lot(self.map_lot)
        client = User.objects.create(username='buyer')
        for number in range(1, 13):
            item, _ = Lot.objects.get_or_create(
                subdivision=lot.subdivision, block='1', lot_number=number,
                defaults={'area': 100},
            )
            ReservationRequest.objects.create(lot=item, client=client)
        payload = build_reservation_analytics({})
        self.assertEqual(len(payload['most_reserved_lots']), 10)
        self.assertEqual(payload['reservation_by_subdivision'][0]['reservation_count'], 12)
