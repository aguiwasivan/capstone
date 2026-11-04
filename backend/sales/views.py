from decimal import Decimal
from datetime import datetime
import math

from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import BlueprintLot, ReservationRequest, SaleTransaction
from .serializers import SaleTransactionSerializer

try:
    from sklearn.ensemble import RandomForestRegressor
except ImportError:
    RandomForestRegressor = None


STAFF_ROLES = ['agent', 'manager', 'broker']
REPORT_VIEW_ROLES = ['admin', 'manager']
APPROVED_RESERVATION_STATUS = 'approved'
DECLINED_RESERVATION_STATUSES = {'declined', 'cancelled', 'rejected'}
RESERVED_LOT_STATUS = 'reserved'
SOLD_LOT_STATUS = 'sold'
FORECAST_MIN_MONTHS = 6
FORECAST_LIMITED_MONTHS = 11
WALK_FORWARD_MIN_TRAIN_MONTHS = 6
FORECAST_LAGS = 3


def sale_has_status_field():
    return any(field.name == 'status' for field in SaleTransaction._meta.fields)


def completed_sale_status_values():
    if not sale_has_status_field():
        return set()
    status_field = SaleTransaction._meta.get_field('status')
    values = {choice[0] for choice in status_field.choices}
    completed_aliases = {'completed', 'closed', 'complete', 'sold'}
    return values.intersection(completed_aliases) or values.intersection({'completed', 'closed'})


COMPLETED_SALE_STATUSES = completed_sale_status_values()


def is_completed_sale(sale):
    if not sale_has_status_field():
        return True
    return getattr(sale, 'status', None) in COMPLETED_SALE_STATUSES


def other_completed_sales_for_lot(lot, exclude_sale_id=None):
    if not lot:
        return SaleTransaction.objects.none()

    queryset = SaleTransaction.objects.filter(lot=lot)
    if exclude_sale_id:
        queryset = queryset.exclude(pk=exclude_sale_id)
    if sale_has_status_field():
        queryset = queryset.filter(status__in=COMPLETED_SALE_STATUSES)
    return queryset


def lot_number_as_int(value):
    digits = ''.join(character for character in str(value or '') if character.isdigit())
    return int(digits) if digits else None


def matching_blueprint_lots_for_lot(lot):
    if not lot or not lot.subdivision:
        return BlueprintLot.objects.none()

    candidates = BlueprintLot.objects.filter(
        blueprint__title=lot.subdivision.name,
        block_number=lot.block,
    )
    lot_number = lot_number_as_int(lot.lot_number)
    matching_ids = [
        blueprint_lot.id
        for blueprint_lot in candidates
        if lot_number_as_int(blueprint_lot.lot_number) == lot_number
    ]
    return BlueprintLot.objects.filter(id__in=matching_ids)


def sync_blueprint_lot_status(lot, next_status):
    matching_blueprint_lots_for_lot(lot).update(status=next_status)


def restore_reservation_lot_if_needed(reservation, lot, exclude_sale_id=None):
    if lot and other_completed_sales_for_lot(lot, exclude_sale_id).exists():
        return

    if reservation and reservation.status == APPROVED_RESERVATION_STATUS and lot:
        lot.status = RESERVED_LOT_STATUS
        lot.save(update_fields=['status'])
        sync_blueprint_lot_status(lot, RESERVED_LOT_STATUS)


def validate_sale_conversion(sale, exclude_sale_id=None):
    if not is_completed_sale(sale):
        return None

    if not sale.reservation:
        if sale.lot and other_completed_sales_for_lot(sale.lot, exclude_sale_id).exists():
            return 'This lot already has a completed sales transaction.'
        if sale.lot and sale.lot.status != RESERVED_LOT_STATUS:
            return 'The linked lot must be reserved before completing a sale.'
        return None

    reservation = sale.reservation
    lot = sale.lot or reservation.lot

    if reservation.status in DECLINED_RESERVATION_STATUSES:
        return 'Declined or cancelled reservations cannot be converted to sales.'
    if reservation.status != APPROVED_RESERVATION_STATUS:
        return 'Only approved reservations can be converted to sales.'
    if lot != reservation.lot:
        return 'The sales transaction lot must match the linked reservation lot.'
    if lot.status != RESERVED_LOT_STATUS:
        return 'The linked lot must be reserved before completing a sale.'
    if other_completed_sales_for_lot(lot, exclude_sale_id).exists():
        return 'This lot already has a completed sales transaction.'

    return None


def apply_sale_conversion(sale):
    if not is_completed_sale(sale):
        return

    lot = sale.lot or sale.reservation.lot if sale.reservation else sale.lot
    if not lot:
        return

    lot.status = SOLD_LOT_STATUS
    lot.save(update_fields=['status'])
    sync_blueprint_lot_status(lot, SOLD_LOT_STATUS)


def reconcile_sale_change(current_sale, previous_reservation=None, previous_lot=None):
    if previous_lot and previous_lot != current_sale.lot:
        restore_reservation_lot_if_needed(previous_reservation, previous_lot, current_sale.pk)
    elif previous_reservation and previous_reservation != current_sale.reservation:
        restore_reservation_lot_if_needed(previous_reservation, previous_lot, current_sale.pk)

    apply_sale_conversion(current_sale)


def is_admin(user):
    return user.is_authenticated and user.role == 'admin'


def role_name(request):
    return str(getattr(request.user, 'role', '') or '').lower()


def require_authenticated(request):
    if not getattr(request.user, 'is_authenticated', False):
        return Response({'detail': 'Authentication is required.'}, status=status.HTTP_401_UNAUTHORIZED)
    return None


def require_admin(request):
    auth_error = require_authenticated(request)
    if auth_error:
        return auth_error
    if role_name(request) != 'admin':
        return Response({'detail': 'Admin access is required.'}, status=status.HTTP_403_FORBIDDEN)
    return None


def require_report_viewer(request):
    auth_error = require_authenticated(request)
    if auth_error:
        return auth_error
    if role_name(request) not in REPORT_VIEW_ROLES:
        return Response({'detail': 'Only admins and managers can access reports.'}, status=status.HTTP_403_FORBIDDEN)
    return None


def require_sales_viewer(request):
    error = require_authenticated(request)
    if error:
        return error
    if role_name(request) not in ['admin', *STAFF_ROLES]:
        return Response({'detail': 'Sales staff access is required.'}, status=status.HTTP_403_FORBIDDEN)
    return None


def sales_queryset_for(user):
    queryset = SaleTransaction.objects.select_related(
        'agent',
        'manager',
        'broker',
        'client',
        'reservation',
        'lot',
        'lot__subdivision',
    )
    if is_admin(user):
        return queryset
    user_role = str(getattr(user, 'role', '') or '').lower()
    if user_role == 'agent':
        return queryset.filter(agent=user)
    if user_role == 'manager':
        return queryset.filter(manager=user)
    if user_role == 'broker':
        return queryset.filter(broker=user)
    return SaleTransaction.objects.none()


def period_label(sale_date, period):
    if period == 'annual':
        return str(sale_date.year)

    return f'{sale_date.year}-{sale_date.month:02d}'


def next_period_label(label, period, offset):
    if period == 'annual':
        return str(int(label) + offset)

    year_text, month_text = label.split('-')
    year = int(year_text)
    month = int(month_text)
    next_month_index = (year * 12 + month - 1) + offset
    next_year = next_month_index // 12
    next_month = (next_month_index % 12) + 1
    return f'{next_year}-{next_month:02d}'


def average_growth(values):
    if len(values) < 2:
        return Decimal('0')

    differences = [
        values[index] - values[index - 1]
        for index in range(1, len(values))
    ]
    return sum(differences, Decimal('0')) / Decimal(len(differences))


def fallback_growth_from_transactions(sales, value_field):
    values = list(sales.values_list(value_field, flat=True).order_by('sale_date', 'created_at', 'id'))

    if len(values) < 2:
        return Decimal('0')

    growth = average_growth(values)
    if growth != 0:
        return growth

    smallest = min(values)
    largest = max(values)
    if largest == smallest:
        return largest * Decimal('0.03')

    return (largest - smallest) / Decimal(max(len(values) - 1, 1))


def decimal_to_string(value):
    return str(value.quantize(Decimal('0.01')))


def parse_monthly_sales_rows(rows):
    cleaned_rows = []
    errors = []

    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f'Row {index + 1} must be an object.')
            continue

        month = row.get('month')
        total_sales = row.get('total_sales')

        try:
            parsed_month = datetime.strptime(str(month), '%Y-%m')
            if parsed_month.strftime('%Y-%m') != str(month):
                raise ValueError('Noncanonical month')
        except (TypeError, ValueError):
            errors.append(f'Row {index + 1} month must use YYYY-MM format.')
            continue

        try:
            total_sales = Decimal(str(total_sales))
        except Exception:
            errors.append(f'Row {index + 1} total_sales must be a number.')
            continue

        if not total_sales.is_finite():
            errors.append(f'Row {index + 1} total_sales must be finite.')
            continue
        if total_sales < 0:
            errors.append(f'Row {index + 1} total_sales cannot be negative.')
            continue

        cleaned_rows.append({
            'month': str(month),
            'total_sales': total_sales,
        })

    cleaned_rows.sort(key=lambda item: item['month'])
    for previous, current in zip(cleaned_rows, cleaned_rows[1:]):
        if current['month'] != next_period_label(previous['month'], 'monthly', 1):
            errors.append('Provide one row per consecutive month, including zero-sales months.')
            break
    return cleaned_rows, errors


def build_line_graph_data(history, forecast):
    actual_series = [
        {
            'period': item['period'],
            'value': item['total_contract_price'],
            'sales': item['total_sales'],
            'type': 'actual',
        }
        for item in history
    ]
    forecast_series = [
        {
            'period': item['period'],
            'value': item['predicted_contract_price'],
            'sales': item['predicted_sales'],
            'type': 'forecast',
        }
        for item in forecast
    ]
    series = actual_series + forecast_series
    max_value = max([Decimal(item['value']) for item in series], default=Decimal('0'))

    return {
        'actual': actual_series,
        'forecast': forecast_series,
        'series': series,
        'labels': [item['period'] for item in series],
        'max_value': decimal_to_string(max_value),
    }


def decimal_from_float(value):
    if value is None or not math.isfinite(float(value)):
        return Decimal('0')
    return Decimal(str(max(0, float(value))))


def metric_to_string(value):
    if value is None:
        return None
    return decimal_to_string(Decimal(str(value)))


def pct_metric_to_string(value):
    if value is None:
        return None
    return str(Decimal(str(value)).quantize(Decimal('0.01')))


def random_forest_predict_value(values):
    if RandomForestRegressor is None or len(values) < FORECAST_MIN_MONTHS:
        return None
    try:
        numeric_values = [float(value) for value in values]
        if any(not math.isfinite(value) or value < 0 for value in numeric_values):
            return None
        # Every training row uses only months preceding its target month.
        features = [
            numeric_values[index - FORECAST_LAGS:index]
            for index in range(FORECAST_LAGS, len(numeric_values))
        ]
        targets = numeric_values[FORECAST_LAGS:]
        model = RandomForestRegressor(
            n_estimators=100, max_depth=6, random_state=42, n_jobs=1,
        )
        model.fit(features, targets)
        prediction = model.predict([numeric_values[-FORECAST_LAGS:]])[0]
        return decimal_from_float(prediction) if math.isfinite(float(prediction)) else None
    except (ValueError, OverflowError):
        return None


def forecast_metrics(actual_values, predicted_values):
    if not actual_values or not predicted_values:
        return {
            'mae': None,
            'rmse': None,
            'mape': None,
            'validation_points': 0,
        }

    errors = [
        abs(float(actual_values[index] - predicted_values[index]))
        for index in range(len(actual_values))
    ]
    squared_errors = [error ** 2 for error in errors]
    pct_errors = [
        abs(float(actual_values[index] - predicted_values[index]) / float(actual_values[index])) * 100
        for index in range(len(actual_values))
        if actual_values[index] != 0
    ]

    return {
        'mae': metric_to_string(sum(errors) / len(errors)),
        'rmse': metric_to_string(math.sqrt(sum(squared_errors) / len(squared_errors))),
        'mape': pct_metric_to_string(sum(pct_errors) / len(pct_errors)) if pct_errors else None,
        'validation_points': len(actual_values),
    }


def walk_forward_validation(values, predict_fn):
    actual_values = []
    predicted_values = []

    for index in range(WALK_FORWARD_MIN_TRAIN_MONTHS, len(values)):
        prediction = predict_fn(values[:index])
        if prediction is None:
            continue
        actual_values.append(values[index])
        predicted_values.append(prediction)

    return forecast_metrics(actual_values, predicted_values)


def metric_rmse_value(metrics):
    rmse = metrics.get('rmse')
    if rmse is None:
        return None
    return Decimal(str(rmse))


def model_metric_payload(metrics):
    return {
        'mae': metrics.get('mae'),
        'rmse': metrics.get('rmse'),
        'mape': metrics.get('mape'),
        'validation_points': metrics.get('validation_points', 0),
    }


def build_model_comparison_response(sales):
    monthly_rows = (
        sales
        .annotate(month=TruncMonth('sale_date'))
        .values('month')
        .annotate(
            total_sales=Count('id'),
            total_contract_price=Sum('total_contract_price'),
            agent_commission=Sum('agent_commission'),
            manager_commission=Sum('manager_commission'),
            broker_commission=Sum('broker_commission'),
        )
        .order_by('month')
    )

    history = []
    for item in monthly_rows:
        period = f"{item['month'].year}-{item['month'].month:02d}"
        history.append({
            'period': period,
            'total_sales': item['total_sales'],
            'total_contract_price': decimal_to_string(item['total_contract_price'] or Decimal('0')),
            'agent_commission': decimal_to_string(item['agent_commission'] or Decimal('0')),
            'manager_commission': decimal_to_string(item['manager_commission'] or Decimal('0')),
            'broker_commission': decimal_to_string(item['broker_commission'] or Decimal('0')),
        })

    # SQL aggregation omits zero-sales months; retain calendar spacing for lag features.
    if history:
        by_period = {item['period']: item for item in history}
        period = history[0]['period']
        last_period = history[-1]['period']
        history = []
        while period <= last_period:
            history.append(by_period.get(period, {
                'period': period, 'total_sales': 0, 'total_contract_price': '0.00',
                'agent_commission': '0.00', 'manager_commission': '0.00',
                'broker_commission': '0.00',
            }))
            period = next_period_label(period, 'monthly', 1)

    display_history = history
    current_period = timezone.localdate().strftime('%Y-%m')
    history = [row for row in history if row['period'] < current_period]
    if history:
        period = next_period_label(history[-1]['period'], 'monthly', 1)
        while period < current_period:
            history.append({'period': period, 'total_sales': 0, 'total_contract_price': '0.00',
                            'agent_commission': '0.00', 'manager_commission': '0.00', 'broker_commission': '0.00'})
            period = next_period_label(period, 'monthly', 1)
    values = [Decimal(item['total_contract_price']) for item in history]
    month_count = len(values)

    empty_line_graph = {
        'actual': [],
        'forecast': [],
        'series': [],
        'labels': [],
        'max_value': '0.00',
    }

    if month_count < FORECAST_MIN_MONTHS:
        limitation_message = (
            'At least 6 completed monthly sales records are required before the model comparison forecast can run.'
        )
        return {
            'period': 'monthly',
            'history': display_history,
            'forecast_basis': 'Completed calendar months; current and future months excluded.',
            'forecast': [],
            'line_graph': build_line_graph_data(history, []),
            'model_comparison': {
                'selected_model': None,
                'selected_model_label': None,
                'next_period': None,
                'next_month_predicted_sales': None,
                'metrics': {
                    'random_forest': model_metric_payload({}),
                },
                'forecasts': {
                    'random_forest': [],
                },
                'line_chart': [
                    {
                        'period': item['period'],
                        'actual': item['total_contract_price'],
                        'random_forest': None,
                    }
                    for item in history
                ],
                'data_limitation_message': limitation_message,
            },
            'selected_model_name': None,
            'next_month_predicted_sales': None,
            'data_limitation_message': limitation_message,
            'insight': limitation_message,
        }

    next_period = next_period_label(history[-1]['period'], 'monthly', 1)
    forest_next = random_forest_predict_value(values)
    forest_metrics = walk_forward_validation(values, random_forest_predict_value)
    selected_key = 'random_forest' if forest_next is not None else None
    selected_label = "Random Forest" if forest_next is not None else None

    limitation_message = ''
    if RandomForestRegressor is None:
        limitation_message = (
            "Random Forest requires scikit-learn before the forecast can run."
        )
    elif forest_next is None:
        limitation_message = (
            "Random Forest could not produce a reliable forecast from the current monthly sales history."
        )
    elif month_count <= FORECAST_LIMITED_MONTHS:
        limitation_message = (
            'Limited reliability: only an initial next-month forecast is available with fewer than 12 completed monthly records.'
        )

    forecast = []
    if forest_next is not None:
        component_predictions = {
            field: random_forest_predict_value([Decimal(item[field]) for item in history])
            for field in ['total_sales', 'agent_commission', 'manager_commission', 'broker_commission']
        }
        forecast = [{
            'period': next_period,
            'predicted_sales': round(component_predictions['total_sales']) if component_predictions['total_sales'] is not None else None,
            'predicted_contract_price': decimal_to_string(forest_next),
            **{
                f'predicted_{field}': decimal_to_string(component_predictions[field])
                if component_predictions[field] is not None else None
                for field in ['agent_commission', 'manager_commission', 'broker_commission']
            },
            'selected_model': selected_key,
        }]

    comparison_series = [
        {
            'period': item['period'],
            'actual': item['total_contract_price'],
            'random_forest': None,
        }
        for item in history
    ]
    if forest_next is not None:
        comparison_series.append({
            'period': next_period,
            'actual': None,
            'random_forest': decimal_to_string(forest_next),
        })

    line_graph = build_line_graph_data(history, forecast)
    return {
        'period': 'monthly',
        'history': display_history,
        'forecast_basis': 'Completed calendar months; current and future months excluded.',
        'forecast': forecast,
        'line_graph': line_graph,
        'model_comparison': {
            'selected_model': selected_key,
            'selected_model_label': selected_label,
            'next_period': next_period,
            'next_month_predicted_sales': decimal_to_string(forest_next) if forest_next is not None else None,
            'metrics': {
                'random_forest': model_metric_payload(forest_metrics),
            },
            'forecasts': {
                'random_forest': [{
                    'period': next_period,
                    'predicted_sales': decimal_to_string(forest_next),
                }] if forest_next is not None else [],
            },
            'line_chart': comparison_series,
            'data_limitation_message': limitation_message,
        },
        'selected_model_name': selected_label,
        'next_month_predicted_sales': decimal_to_string(forest_next) if forest_next is not None else None,
        'data_limitation_message': limitation_message,
        'insight': (
            f"{selected_label} is used for the next-month forecast."
            if not limitation_message else limitation_message
        ),
    }


class SalesTransactionListCreateView(APIView):
    permission_classes = []

    def get(self, request):
        error = require_sales_viewer(request)
        if error:
            return error
        queryset = sales_queryset_for(request.user)
        return Response(SaleTransactionSerializer(queryset, many=True).data)

    def post(self, request):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        serializer = SaleTransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created_by = request.user if request.user.is_authenticated else None
        with transaction.atomic():
            sale = serializer.save(created_by=created_by)
            validation_error = validate_sale_conversion(sale, exclude_sale_id=sale.pk)
            if validation_error:
                raise ValidationError({'detail': validation_error})
            apply_sale_conversion(sale)
        return Response(SaleTransactionSerializer(sale).data, status=status.HTTP_201_CREATED)


class SalesTransactionDetailView(APIView):
    permission_classes = []

    def get_object(self, request, pk):
        try:
            return sales_queryset_for(request.user).get(pk=pk)
        except SaleTransaction.DoesNotExist:
            return None

    def put(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        sale = self.get_object(request, pk)
        if not sale:
            return Response({'detail': 'Sale transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        previous_reservation = sale.reservation
        previous_lot = sale.lot
        serializer = SaleTransactionSerializer(sale, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            sale = serializer.save()
            validation_error = validate_sale_conversion(sale, exclude_sale_id=sale.pk)
            if validation_error:
                raise ValidationError({'detail': validation_error})
            reconcile_sale_change(sale, previous_reservation, previous_lot)
        return Response(serializer.data)

    def delete(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        sale = self.get_object(request, pk)
        if not sale:
            return Response({'detail': 'Sale transaction not found.'}, status=status.HTTP_404_NOT_FOUND)

        previous_reservation = sale.reservation
        previous_lot = sale.lot
        with transaction.atomic():
            sale.delete()
            restore_reservation_lot_if_needed(previous_reservation, previous_lot)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SalesAnalyticsView(APIView):
    permission_classes = []

    def get(self, request):
        error = require_sales_viewer(request)
        if error:
            return error
        queryset = sales_queryset_for(request.user)
        totals = queryset.aggregate(
            total_sales=Count('id'),
            total_contract_price=Sum('total_contract_price'),
            agent_commission=Sum('agent_commission'),
            manager_commission=Sum('manager_commission'),
            broker_commission=Sum('broker_commission'),
        )

        by_project = (
            queryset
            .values('project')
            .annotate(total_sales=Count('id'), total_contract_price=Sum('total_contract_price'))
            .order_by('-total_contract_price')
        )

        return Response({
            'summary': totals,
            'by_project': list(by_project),
            'as_of_date': timezone.localdate().isoformat(),
            'time_zone': timezone.get_current_timezone_name(),
        })


class SalesForecastView(APIView):
    permission_classes = []

    def post(self, request):
        rows = request.data
        if isinstance(rows, dict):
            rows = rows.get('history', rows.get('data'))

        if not isinstance(rows, list):
            return Response(
                {'detail': 'Send historical monthly sales as a JSON array.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        history, errors = parse_monthly_sales_rows(rows)
        if errors:
            return Response({'detail': errors}, status=status.HTTP_400_BAD_REQUEST)

        if not history:
            return Response(
                {'detail': 'At least one month of sales data is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(history) < WALK_FORWARD_MIN_TRAIN_MONTHS:
            return Response(
                {'detail': f"At least {WALK_FORWARD_MIN_TRAIN_MONTHS} months of sales data are required for Random Forest."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        values = [item['total_sales'] for item in history]
        predicted_next_month = random_forest_predict_value(values)
        if predicted_next_month is None:
            return Response(
                {'detail': "Random Forest could not produce a forecast from the supplied sales history."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        trend = 'increasing' if predicted_next_month >= values[-1] else 'decreasing'

        return Response({
            'predicted_next_month': float(predicted_next_month.quantize(Decimal('0.01'))),
            'trend': trend,
            'model': "Random Forest",
            'formula': {
                'method': "Random Forest",
                'lag_months': FORECAST_LAGS,
                'n_estimators': 100,
                'random_state': 42,
                'next_x': len(values) + 1,
            },
        })


class SalesPredictionView(APIView):
    permission_classes = []

    def get(self, request):
        error = require_sales_viewer(request)
        if error:
            return error
        if request.query_params.get('period', 'monthly') != 'monthly':
            raise ValidationError({'detail': 'Only monthly sales prediction is supported.'})
        sales = sales_queryset_for(request.user).order_by('sale_date')
        return Response(build_model_comparison_response(sales))


class SalesReportView(APIView):
    permission_classes = []

    def get(self, request):
        permission_error = require_report_viewer(request)
        if permission_error:
            return permission_error

        sales = sales_queryset_for(request.user)
        analytics = sales.aggregate(
            total_sales=Count('id'),
            total_contract_price=Sum('total_contract_price'),
            agent_commission=Sum('agent_commission'),
            manager_commission=Sum('manager_commission'),
            broker_commission=Sum('broker_commission'),
        )

        return Response({
            'generated_at': timezone.now(),
            'summary': analytics,
            'transactions': SaleTransactionSerializer(sales, many=True).data,
        })
