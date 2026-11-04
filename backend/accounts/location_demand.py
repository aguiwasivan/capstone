"""Aggregate existing scores; zone membership never contributes to scoring."""
import math
from .models import LOCATION_ZONE_CHOICES


def distribution_by_zone(predictions):
    rows = []
    for zone, label in LOCATION_ZONE_CHOICES:
        lots = [item for item in predictions
                if item.get('location_zone', 'unassigned') == zone
                and item.get('lot_status') == 'available']
        scores = []
        for item in lots:
            value = item.get('demand_score')
            if value is None:
                continue
            try:
                value = float(value)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value):
                scores.append(value)
        rows.append({
            'location_zone': zone,
            'label': label,
            'available_lots': len(lots),
            'scored_lots': len(scores),
            'average_score': round(sum(scores) / len(scores), 2) if scores else None,
        })
    return rows
