"""Fill missing COTTA zones from the supplied colored map; dry run by default."""
import contextlib
import io
import json
import os
import sys
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'backend'
sys.path.insert(0, str(root))
from dotenv import load_dotenv
load_dotenv(root / '.env', override=True)
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
import django
with contextlib.redirect_stdout(io.StringIO()):
    django.setup()
from django.db import transaction
from accounts.models import BlueprintLot, Lot

def zone_for(points):
    if not points:
        return None
    x, y = [sum(p[i] for p in points) / len(points) for i in (0, 1)]
    # Coordinates refer only to the existing COTTA blueprint, not other maps.
    if y < .15:
        return 'rear' if x < .12 else 'central' if x < .548 else 'front'
    if y > .62:
        return 'rear' if x < .328 else 'central' if x < .75 else 'front'
    if x < .115:
        return 'rear'
    if x > .72:
        return 'front'
    # Road labels are not lot polygons.
    if y < .20 or .34 < x < .38:
        return None
    return 'rear' if x < .24 else 'central' if x < .49 else 'front'

apply = '--apply' in sys.argv
with transaction.atomic():
    groups = [
        (Lot, list(Lot.objects.select_for_update().filter(subdivision__name='COTTA')), 'polygon_points'),
        (BlueprintLot, list(BlueprintLot.objects.select_for_update().filter(blueprint__title='COTTA')), 'polygon_coordinates'),
    ]
    changes, skipped = [], []
    for model, rows, field in groups:
        for row in rows:
            if row.location_zone not in ('', None, 'unassigned'):
                continue
            points = getattr(row, field) or getattr(row, 'coordinates', [])
            zone = zone_for(points)
            if zone is None:
                skipped.append({'model': model.__name__, 'id': str(row.pk), 'lot': row.lot_number})
                continue
            changes.append({'model': model.__name__, 'id': str(row.pk), 'before': row.location_zone, 'after': zone})
    report = {'changes': changes, 'skipped': skipped}
    if apply:
        backup = Path(__file__).with_name('cotta-zone-backup.json')
        with backup.open('x', encoding='utf-8') as output:
            json.dump(report, output, indent=2)
        models = {'Lot': Lot, 'BlueprintLot': BlueprintLot}
        for change in changes:
            model = models[change['model']]
            assert model.objects.filter(pk=change['id'], location_zone=change['before']).update(location_zone=change['after']) == 1
        for change in changes:
            assert models[change['model']].objects.get(pk=change['id']).location_zone == change['after']
    print('Applied' if apply else 'Planned', dict(Counter((c['model'], c['after']) for c in changes)))
    print('Skipped:', skipped)
