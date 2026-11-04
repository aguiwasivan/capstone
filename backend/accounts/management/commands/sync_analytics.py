from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.analytics_sync import ambiguous_published_lot_ids, sync_published_blueprint
from accounts.models import Blueprint, Lot, ReservationRequest, SaleTransaction


class Command(BaseCommand):
    help = 'Backfill published map inventory used by live analytics; safe to rerun.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        blueprints = list(Blueprint.objects.filter(status='published').prefetch_related('lots'))
        ambiguous_ids = ambiguous_published_lot_ids()
        ambiguous = len(ambiguous_ids)
        count = sum(
            sync_published_blueprint(blueprint, ambiguous_ids)
            for blueprint in blueprints
        )
        self.stdout.write(
            f'Synced {count} published map lots. Analytics sources: '
            f'{Lot.objects.count()} lots, {ReservationRequest.objects.count()} reservations, '
            f'{SaleTransaction.objects.count()} sales.'
        )
        if ambiguous:
            self.stdout.write(self.style.WARNING(
                f'Skipped {ambiguous} map records with ambiguous subdivision/block/lot identities. '
                'Correct their block and lot numbers before rerunning; these records were not merged.'
            ))
        if options['dry_run']:
            transaction.set_rollback(True)
            self.stdout.write('Dry run: all changes rolled back.')
