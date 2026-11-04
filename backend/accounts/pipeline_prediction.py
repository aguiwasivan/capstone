"""Empirical pipeline estimates from resolved reservations, with explicit ownership."""
from collections import defaultdict

from django.db.models import Count, Exists, Q

from .models import ReservationRequest


def build_pipeline(params):
    from .views import (filtered_performance_reservations, reservation_conversion_exists_query,
                        user_display_name)
    reservations = filtered_performance_reservations(params).annotate(
        converted=Exists(reservation_conversion_exists_query()))
    active = reservations.filter(status='approved', converted=False).select_related('assigned_agent', 'lot')
    if params.get('user_id'):
        active = active.filter(assigned_agent_id=params['user_id'])
    active = list(active)
    # Pending/approved requests without a sale are unresolved, not failed conversions.
    historical = ReservationRequest.objects.annotate(converted=Exists(reservation_conversion_exists_query()))
    # Transfer one aggregate per agent, not every historical reservation.
    by_agent = {row['assigned_agent_id']: row for row in historical.filter(
        Q(converted=True) | Q(status__in=('declined', 'rejected', 'cancelled')),
    ).order_by().values('assigned_agent_id').annotate(
        samples=Count('id'), positives=Count('id', filter=Q(converted=True)),
    )}
    resolved_count = sum(row['samples'] for row in by_agent.values())
    global_rate = sum(row['positives'] for row in by_agent.values()) / resolved_count if resolved_count else None
    grouped = defaultdict(list)
    for row in active:
        grouped[row.assigned_agent_id].append(row)
    rows = []
    for agent_id, requests in grouped.items():
        outcomes = by_agent.get(agent_id, {'samples': 0, 'positives': 0})
        # Use an agent rate only with >=5 resolved records; otherwise disclose pooled history.
        own_rate = agent_id is not None and outcomes['samples'] >= 5
        probability = outcomes['positives'] / outcomes['samples'] if own_rate else global_rate
        value = sum(float(row.lot.price or 0) for row in requests)
        rows.append({
            'agent_id': agent_id, 'agent_name': user_display_name(requests[0].assigned_agent) if agent_id else 'Unassigned',
            'active_approved_reservations': len(requests), 'pipeline_value': round(value, 2),
            'expected_converted_reservations': round(len(requests)*probability, 2) if probability is not None else None,
            'projected_sales_value': round(value*probability, 2) if probability is not None else None,
            'conversion_probability': probability,
            'probability_basis': 'Agent resolved reservations' if own_rate else 'All resolved reservations',
            'resolved_samples': outcomes['samples'] if own_rate else resolved_count,
            'projected_commission': None,
            'pipeline_label': 'Insufficient history' if probability is None else
                'High Potential' if probability >= .7 else 'Moderate Potential' if probability >= .4 else 'Needs Follow-Up',
            'missing_prices': sum(row.lot.price is None for row in requests),
        })
    rows.sort(key=lambda row: (-(row['projected_sales_value'] or 0), row['agent_id'] or 0))
    for rank, row in enumerate(rows, 1):
        row['rank'] = rank
    return {
        'model_available': global_rate is not None, 'mode': 'historical_conversion_rate',
        'model_name': 'Historical resolved-reservation conversion rate',
        'message': ('Estimates use resolved reservation outcomes, not a trained ML model. Open reservations are excluded from the historical denominator. '
                    'Agents with fewer than 5 resolved records use the overall rate. Unassigned reservations are shown separately. Missing lot prices contribute no value.')
                    if resolved_count else 'No resolved reservation outcomes yet. Pipeline counts are available; projections need completed or declined/cancelled reservations.',
        'summary': {
            'predicted_top_agent': next((row for row in rows if row['agent_id'] is not None), None) if resolved_count else None,
            'total_active_approved_reservations': len(active),
            'unassigned_reservations': sum(row.assigned_agent_id is None for row in active),
            'total_projected_pipeline_value': round(sum(row['projected_sales_value'] for row in rows), 2) if resolved_count else None,
        },
        'agent_pipeline_forecasts': rows,
    }
