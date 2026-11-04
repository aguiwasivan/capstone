"""Keep published map inventory available to reservation and demand analytics."""
from collections import defaultdict

from django.db import transaction

from .models import BlueprintLot, Lot, Subdivision


def lot_identity_number(value):
    digits = ''.join(c for c in str(value or '') if c.isdigit())
    return int(digits) if digits else None


def has_ambiguous_identity(blueprint_lot):
    number = lot_identity_number(blueprint_lot.lot_number)
    candidates = BlueprintLot.objects.filter(
        blueprint__status='published',
        blueprint__title=blueprint_lot.blueprint.title,
        block_number=blueprint_lot.block_number,
    ).exclude(pk=blueprint_lot.pk).exclude(status='open_space')
    return any(lot_identity_number(value) == number for value in candidates.values_list('lot_number', flat=True))


def ambiguous_published_lot_ids():
    identities = defaultdict(list)
    for row in BlueprintLot.objects.filter(blueprint__status='published').exclude(status='open_space').values(
        'id', 'blueprint__title', 'block_number', 'lot_number',
    ):
        number = lot_identity_number(row['lot_number'])
        if number is not None:
            identities[(row['blueprint__title'], row['block_number'], number)].append(row['id'])
    return {pk for ids in identities.values() if len(ids) > 1 for pk in ids}


@transaction.atomic
def sync_blueprint_lot(blueprint_lot, ambiguous_ids=None):
    if blueprint_lot.blueprint.status != 'published':
        return None
    digits = ''.join(c for c in str(blueprint_lot.lot_number or '') if c.isdigit())
    # Non-lot map annotations must not become available inventory.
    if not digits or blueprint_lot.status == 'open_space':
        return None
    # Repeated numbers with missing block information cannot safely be merged.
    if (blueprint_lot.pk in ambiguous_ids if ambiguous_ids is not None else has_ambiguous_identity(blueprint_lot)):
        return None
    subdivision, _ = Subdivision.objects.get_or_create(
        name=blueprint_lot.blueprint.title or 'Subdivision Blueprint',
    )
    try:
        area = max(int(float(blueprint_lot.area_sqm or blueprint_lot.size or 0)), 1)
    except (TypeError, ValueError, OverflowError):
        area = 1
    values = {
        'area': area,
        'price': blueprint_lot.price or 0,
        'polygon_points': blueprint_lot.polygon_coordinates or blueprint_lot.coordinates or [],
        'location_url': blueprint_lot.location_url or '',
        'location_zone': blueprint_lot.location_zone,
        'status': blueprint_lot.status,
    }
    lot, created = Lot.objects.get_or_create(
        subdivision=subdivision,
        block=blueprint_lot.block_number or '',
        lot_number=int(digits),
        defaults=values,
    )
    if not created:
        # Transaction history takes precedence over stale map status.
        if lot.sales.exists() or lot.reservation_requests.filter(sales__isnull=False).exists():
            values['status'] = 'sold'
        elif lot.reservation_requests.filter(status='approved').exists():
            values['status'] = 'reserved'
        elif lot.reservation_requests.filter(status='pending').exists():
            values['status'] = 'pending'
        for field, value in values.items():
            setattr(lot, field, value)
        lot.save(update_fields=list(values))
    return lot


@transaction.atomic
def sync_published_blueprint(blueprint, ambiguous_ids=None):
    if ambiguous_ids is None:
        ambiguous_ids = ambiguous_published_lot_ids()
    return sum(sync_blueprint_lot(lot, ambiguous_ids) is not None for lot in blueprint.lots.all())
