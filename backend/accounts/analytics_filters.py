from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError


def validate_analytics_filters(params):
    dates = {}
    for key in ('start_date', 'end_date'):
        value = params.get(key)
        if not value:
            continue
        try:
            parsed = parse_date(value)
        except (ValueError, TypeError):
            parsed = None
        if parsed is None:
            raise ValidationError({'detail': f'{key} must be a valid YYYY-MM-DD date.'})
        dates[key] = parsed
    if len(dates) == 2 and dates['start_date'] > dates['end_date']:
        raise ValidationError({'detail': 'Start date must not be after end date.'})
    for key in ('year', 'subdivision_id', 'user_id'):
        value = params.get(key)
        if value:
            try:
                number = int(value)
            except (ValueError, TypeError):
                number = 0
            if number <= 0 or (key == 'year' and number > 9999):
                raise ValidationError({'detail': f'{key} must be a valid positive integer.'})
    for key in ('status', 'reservation_status'):
        if params.get(key) and params[key] not in ('pending', 'approved', 'declined', 'rejected', 'cancelled'):
            raise ValidationError({'detail': f'Invalid {key}.'})
    if params.get('sales_status') not in (None, '', 'completed'):
        raise ValidationError({'detail': 'Only completed sales are recorded.'})
