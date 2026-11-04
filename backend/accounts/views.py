import base64
import json
import math
import mimetypes
import os
import re
import uuid
from collections import Counter, defaultdict
from datetime import timedelta
from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import connection
from django.db import transaction
from django.db.models import Avg, Count, Exists, OuterRef, Prefetch, Q, Sum, Subquery
from django.db.models.functions import TruncMonth
from django.db.utils import ProgrammingError
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import LOCATION_ZONE_CHOICES, Blueprint, BlueprintLot, Lot, Notification, ReservationRequest, SaleTransaction, Subdivision, SystemParameter, User
from .serializers import (
    BlueprintLotSerializer,
    BlueprintSerializer,
    LoginSerializer,
    LotSerializer,
    NotificationSerializer,
    PasswordChangeSerializer,
    RegisterSerializer,
    ReservationRequestSerializer,
    SubdivisionSerializer,
    SystemParameterSerializer,
    UserManagementSerializer,
    UserProfileSerializer,
)
from sales.serializers import SaleTransactionSerializer
from .analytics_sync import sync_blueprint_lot, sync_published_blueprint
from .location_demand import distribution_by_zone
from .analytics_filters import validate_analytics_filters
from .demand_prediction import capture_observations, readiness, train_model, model_predictions
from .pipeline_prediction import build_pipeline


STAFF_ROLES = ['agent', 'manager', 'broker']
RESERVATION_REVIEW_ROLES = ['admin', 'manager', 'broker']
REPORT_VIEW_ROLES = ['admin', 'manager']
RESERVATION_ANALYTICS_STATUSES = ['pending', 'approved', 'declined', 'cancelled']
BLUEPRINT_DETECTION_ERROR = (
    'The system could not confidently detect individual lot areas from this blueprint. '
    'Please use admin edit mode to add or adjust lot polygons manually.'
)
SUPABASE_BUCKET_PUBLIC_CACHE = {}


class SupabaseStorageError(Exception):
    def __init__(self, error, details=''):
        super().__init__(error)
        self.error = error
        self.details = details


def role_name(request):
    return str(getattr(request.user, 'role', '') or '').lower()


def is_authenticated_request(request):
    return bool(getattr(request.user, 'is_authenticated', False))


def access_denied(detail='Access denied.'):
    return Response({'detail': detail}, status=status.HTTP_403_FORBIDDEN)


def require_authenticated(request):
    if not is_authenticated_request(request):
        return Response({'detail': 'Authentication is required.'}, status=status.HTTP_401_UNAUTHORIZED)
    return None


def require_role(request, allowed_roles, detail='Access denied.'):
    auth_error = require_authenticated(request)
    if auth_error:
        return auth_error
    if role_name(request) not in allowed_roles:
        return access_denied(detail)
    return None


def require_admin(request):
    return require_role(request, ['admin'], 'Admin access is required.')


def require_reservation_reviewer(request):
    return require_role(
        request,
        RESERVATION_REVIEW_ROLES,
        'Only managers and brokers can approve or decline reservation requests.',
    )


def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


def user_payload(user):
    return {
        'id': user.id,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
        'role': user.role,
        'role_label': user.get_role_display(),
        'is_active': user.is_active,
        'date_joined': user.date_joined,
        'last_login': user.last_login,
        'phone_number': user.phone_number,
        'date_of_birth': user.date_of_birth,
        'address_line1': user.address_line1,
        'address_line2': user.address_line2,
        'city': user.city,
        'province': user.province,
        'postal_code': user.postal_code,
        'buyer_type': user.buyer_type,
        'preferred_contact_method': user.preferred_contact_method,
        'payment_card_last4': user.payment_card_last4,
    }


def auth_response(user, response_status=status.HTTP_200_OK):
    tokens = get_tokens(user)
    return Response({
        'user': user_payload(user),
        'refresh': tokens['refresh'],
        'access': tokens['access'],
        'tokens': tokens,
    }, status=response_status)


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return auth_response(user, status.HTTP_201_CREATED)


class UserManagementListCreateView(APIView):
    permission_classes = []

    def get(self, request):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        users = User.objects.all().order_by('role', 'last_name', 'first_name', 'username')
        return Response(UserManagementSerializer(users, many=True).data)

    def post(self, request):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        serializer = UserManagementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserManagementSerializer(user).data, status=status.HTTP_201_CREATED)


class UserManagementDetailView(APIView):
    permission_classes = []

    def get_object(self, pk):
        try:
            return User.objects.get(pk=pk)
        except User.DoesNotExist:
            return None

    def put(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        user = self.get_object(pk)
        if not user:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserManagementSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        user = self.get_object(pk)
        if not user:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SystemParameterListCreateView(APIView):
    permission_classes = []

    def get(self, request):
        permission_error = require_role(request, REPORT_VIEW_ROLES, 'Only admins and managers can view reports.')
        if permission_error:
            return permission_error

        parameters = SystemParameter.objects.all()
        return Response(SystemParameterSerializer(parameters, many=True).data)

    def post(self, request):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        serializer = SystemParameterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parameter = serializer.save()
        return Response(SystemParameterSerializer(parameter).data, status=status.HTTP_201_CREATED)


class SystemParameterDetailView(APIView):
    permission_classes = []

    def put(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            parameter = SystemParameter.objects.get(pk=pk)
        except SystemParameter.DoesNotExist:
            return Response({'detail': 'System parameter not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = SystemParameterSerializer(parameter, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            parameter = SystemParameter.objects.get(pk=pk)
        except SystemParameter.DoesNotExist:
            return Response({'detail': 'System parameter not found.'}, status=status.HTTP_404_NOT_FOUND)

        parameter.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(APIView):
    permission_classes = []

    def get(self, request):
        return Response(UserProfileSerializer(request.user).data) if request.user.is_authenticated else Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    def put(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = UserProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)


def profile_reservations_queryset(user):
    reservations = ReservationRequest.objects.select_related(
        'lot',
        'lot__subdivision',
        'client',
        'reviewed_by',
    )

    if user.role == 'admin':
        return reservations
    if user.role == 'client':
        return reservations.filter(client=user)

    return reservations.none()


def profile_sales_queryset(user):
    sales = SaleTransaction.objects.select_related(
        'agent',
        'manager',
        'broker',
        'client',
        'lot',
        'lot__subdivision',
        'created_by',
    ).order_by('-sale_date', '-created_at')

    if user.role == 'admin':
        return sales
    if user.role == 'client':
        return sales.filter(client=user)

    return sales.none()


def profile_notifications_queryset(user):
    return Notification.objects.select_related('reservation_request').filter(user=user)


def build_recent_activity(user):
    activities = []
    reservations = profile_reservations_queryset(user)[:5]
    sales = profile_sales_queryset(user)[:5]
    notifications = profile_notifications_queryset(user)[:5]

    for reservation in reservations:
        lot_label = f'{reservation.lot.block}, Lot {reservation.lot.lot_number}' if reservation.lot else 'Lot'
        activities.append({
            'id': f'reservation-{reservation.id}',
            'type': 'Reservation',
            'title': f'Reservation {reservation.status}',
            'description': f'{reservation.client.username} - {lot_label}',
            'created_at': reservation.reviewed_at or reservation.created_at,
        })

    for sale in sales:
        activities.append({
            'id': f'sale-{sale.id}',
            'type': 'Sale',
            'title': sale.project,
            'description': f'TCP {sale.total_contract_price}',
            'created_at': sale.created_at,
        })

    for notification in notifications:
        activities.append({
            'id': f'notification-{notification.id}',
            'type': 'Notification',
            'title': notification.title,
            'description': notification.message,
            'created_at': notification.created_at,
        })

    if user.role == 'admin':
        recent_users = User.objects.order_by('-date_joined')[:5]
        for account in recent_users:
            activities.append({
                'id': f'user-{account.id}',
                'type': 'User',
                'title': f'{account.get_role_display()} account',
                'description': account.get_full_name().strip() or account.username,
                'created_at': account.date_joined,
            })

    return sorted(
        activities,
        key=lambda item: item.get('created_at') or timezone.now(),
        reverse=True,
    )[:10]


def build_profile_summary(user):
    if user.role == 'admin':
        role_counts = {
            item['role']: item['total']
            for item in User.objects.values('role').annotate(total=Count('id'))
        }
        return {
            'user_management_access': True,
            'total_users': User.objects.count(),
            'total_agents': role_counts.get('agent', 0),
            'total_managers': role_counts.get('manager', 0),
            'total_brokers': role_counts.get('broker', 0),
            'total_clients': role_counts.get('client', 0),
            'total_subdivisions': Subdivision.objects.count(),
            'total_lots': Lot.objects.count(),
            'total_reservations': ReservationRequest.objects.count(),
            'total_sales': SaleTransaction.objects.count(),
            'generated_reports': None,
        }

    return {}


def build_profile_payload(user):
    is_admin_profile = user.role == 'admin'

    return {
        'user': UserProfileSerializer(user).data,
        'role': user.role,
        'role_label': user.get_role_display(),
        'summary': build_profile_summary(user),
        'reports': [],
        'recent_activity': build_recent_activity(user) if is_admin_profile else [],
    }


class ProfileDataView(APIView):
    permission_classes = []

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        return Response(build_profile_payload(request.user))


class ProfileChangePasswordView(APIView):
    permission_classes = []

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = PasswordChangeSerializer(
            data=request.data,
            context={'user': request.user},
        )
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])

        return Response({'detail': 'Password changed successfully.'})


class ProfileReservationsView(APIView):
    permission_classes = []

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        reservations = profile_reservations_queryset(request.user)
        return Response(ReservationRequestSerializer(reservations, many=True).data)


class ProfileSalesView(APIView):
    permission_classes = []

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        sales = profile_sales_queryset(request.user)
        return Response(SaleTransactionSerializer(sales, many=True).data)


class ProfilePaymentsView(APIView):
    permission_classes = []

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        return Response([])


class ProfileDocumentsView(APIView):
    permission_classes = []

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        return Response([])


class ProfileSummaryView(APIView):
    permission_classes = []

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

        return Response(build_profile_summary(request.user))


def normalized_reservation_status(status_value):
    status_text = str(status_value or '').lower()
    if status_text == 'rejected':
        return 'declined'
    return status_text


def filtered_reservation_analytics_queryset(params):
    validate_analytics_filters(params)
    reservations = ReservationRequest.objects.select_related('lot', 'lot__subdivision', 'client')

    start_date = parse_date(params.get('start_date') or '')
    end_date = parse_date(params.get('end_date') or '')
    year = params.get('year')
    subdivision_id = params.get('subdivision_id')
    block = params.get('block')
    status_filter = normalized_reservation_status(params.get('status'))

    if start_date:
        reservations = reservations.filter(created_at__date__gte=start_date)
    if end_date:
        reservations = reservations.filter(created_at__date__lte=end_date)
    if year:
        try:
            reservations = reservations.filter(created_at__year=int(year))
        except (TypeError, ValueError):
            pass
    if subdivision_id:
        reservations = reservations.filter(lot__subdivision_id=subdivision_id)
    if block:
        reservations = reservations.filter(lot__block__iexact=block)
    if status_filter:
        if status_filter == 'declined':
            reservations = reservations.filter(status__in=['declined', 'rejected'])
        else:
            reservations = reservations.filter(status=status_filter)

    return reservations


def reservation_conversion_exists_query():
    # Explicit links are authoritative. For legacy unlinked sales, attribute
    # only the latest approved request existing on the sale date, not every
    # request ever made by that client for the same lot.
    legacy_request = ReservationRequest.objects.filter(
        lot_id=OuterRef('lot_id'), client_id=OuterRef('client_id'),
        status='approved', created_at__date__lte=OuterRef('sale_date'),
    ).order_by('-created_at', '-id').values('pk')[:1]
    return SaleTransaction.objects.annotate(
        legacy_request_id=Subquery(legacy_request),
    ).filter(
        Q(reservation=OuterRef('pk')) |
        Q(reservation__isnull=True, legacy_request_id=OuterRef('pk'))
    )


def build_reservation_analytics(params):
    reservations = filtered_reservation_analytics_queryset(params)
    total_reservations = reservations.count()

    status_counts = {status_name: 0 for status_name in RESERVATION_ANALYTICS_STATUSES}
    for row in reservations.values('status').annotate(count=Count('id')):
        status_name = normalized_reservation_status(row['status'])
        if status_name in status_counts:
            status_counts[status_name] += row['count']

    completed_sales_from_reservations = (
        reservations
        .annotate(has_completed_sale=Exists(reservation_conversion_exists_query()))
        .filter(has_completed_sale=True)
        .count()
    )
    conversion_rate = (
        round((completed_sales_from_reservations / total_reservations) * 100, 2)
        if total_reservations
        else 0
    )

    monthly_reservations = [
        {
            'month': row['month'].strftime('%B %Y') if row['month'] else 'Unknown',
            'reservation_count': row['reservation_count'],
        }
        for row in (
            reservations
            .annotate(month=TruncMonth('created_at'))
            .values('month')
            .annotate(reservation_count=Count('id'))
            .order_by('month')
        )
    ]

    status_distribution = [
        {'status': status_name, 'count': status_counts[status_name]}
        for status_name in RESERVATION_ANALYTICS_STATUSES
    ]

    most_reserved_lots = [
        {
            'lot_id': row['lot_id'],
            'lot_number': str(row['lot__lot_number'] or ''),
            'block': row['lot__block'] or '',
            'phase': '',
            'subdivision': row['lot__subdivision__name'] or '',
            'reservation_count': row['reservation_count'],
            'lot_status': row['lot__status'] or '',
        }
        for row in (
            reservations
            .filter(lot__isnull=False)
            .values(
                'lot_id',
                'lot__lot_number',
                'lot__block',
                'lot__subdivision__name',
                'lot__status',
            )
            .annotate(reservation_count=Count('id'))
            .order_by('-reservation_count', 'lot__block', 'lot__lot_number')[:10]
        )
    ]

    most_reserved_blocks_phases = [
        {
            'block': row['lot__block'] or '',
            'subdivision_id': row['lot__subdivision_id'],
            'subdivision': row['lot__subdivision__name'] or '',
            'phase': '',
            'reservation_count': row['reservation_count'],
        }
        for row in (
            reservations
            .filter(lot__isnull=False)
            .values('lot__subdivision_id', 'lot__subdivision__name', 'lot__block')
            .annotate(reservation_count=Count('id'))
            .order_by('-reservation_count', 'lot__block')[:10]
        )
    ]

    return {
        'summary': {
            'total_reservations': total_reservations,
            'pending_reservations': status_counts['pending'],
            'approved_reservations': status_counts['approved'],
            'declined_reservations': status_counts['declined'],
            'cancelled_reservations': status_counts['cancelled'],
            'completed_sales_from_reservations': completed_sales_from_reservations,
            'conversion_rate': conversion_rate,
        },
        'time_zone': timezone.get_current_timezone_name(),
        'monthly_reservations': monthly_reservations,
        'reservation_by_subdivision': [
            {
                'subdivision_id': row['lot__subdivision_id'],
                'subdivision': row['lot__subdivision__name'] or '',
                'reservation_count': row['reservation_count'],
            }
            for row in reservations.values('lot__subdivision_id', 'lot__subdivision__name')
            .annotate(reservation_count=Count('id')).order_by('-reservation_count')
        ],
        'status_distribution': status_distribution,
        'most_reserved_lots': most_reserved_lots,
        'most_reserved_blocks_phases': most_reserved_blocks_phases,
    }


LOT_DEMAND_MIN_OBSERVATIONS = 30
LOT_DEMAND_MIN_POSITIVES = 5
LOT_DEMAND_MIN_NEGATIVES = 5


def lot_demand_label(score):
    if score >= 70:
        return 'High Demand'
    if score >= 40:
        return 'Moderate Demand'
    return 'Low Demand'


def lot_demand_action(label):
    if label == 'High Demand':
        return 'Prioritize marketing and monitor reservation readiness'
    if label == 'Moderate Demand':
        return 'Continue promotion and monitor buyer interest'
    return 'Consider targeted promotion or review pricing strategy'


def normalize_score(value, max_value):
    if not max_value:
        return 0
    return min(1, float(value or 0) / float(max_value))


def build_lot_demand_reasons(score, reservation_count, sold_count, price, average_price):
    reasons = []
    if reservation_count:
        reasons.append(f'{reservation_count} recent reservation request(s) in the same block')
    if sold_count:
        reasons.append(f'{sold_count} recent sold lot(s) in the same block')
    if average_price and price and price <= average_price:
        reasons.append('Price is at or below the current available-lot average')
    if score >= 70 and not reasons:
        reasons.append('Relative demand score is high among currently available lots')
    if not reasons:
        reasons.append('Limited recorded buyer activity for this lot area')
    return reasons[:3]


def lot_demand_training_status():
    return readiness()[0]


def build_lot_demand_payload(lot_id=None, subdivision_id=None):
    now = timezone.now()
    recent_start = now - timedelta(days=90)
    all_available_lots = Lot.objects.filter(status='available')
    if subdivision_id is not None:
        all_available_lots = all_available_lots.filter(subdivision_id=subdivision_id)
    available_lots = list(
        all_available_lots
        .only('id', 'lot_number', 'block', 'price', 'area', 'status', 'location_zone', 'subdivision_id', 'subdivision__name')
        .select_related('subdivision')
        .order_by('subdivision__name', 'block', 'lot_number')
    )

    prices = [lot.price for lot in available_lots if lot.price is not None]
    average_price = sum(prices) / len(prices) if prices else 0
    max_price = max([float(lot.price or 0) for lot in available_lots] + [1])
    max_area = max([float(lot.area or 0) for lot in available_lots] + [1])

    recent_reservations = (
        ReservationRequest.objects
        .select_related('lot', 'lot__subdivision')
        .filter(created_at__gte=recent_start, lot__isnull=False)
    )
    recent_sales = (
        SaleTransaction.objects
        .select_related('lot', 'lot__subdivision')
        .filter(sale_date__gte=recent_start.date(), lot__isnull=False)
    )

    if subdivision_id is not None:
        recent_reservations = recent_reservations.filter(lot__subdivision_id=subdivision_id)
        recent_sales = recent_sales.filter(lot__subdivision_id=subdivision_id)

    reservation_counts = defaultdict(int)
    sold_counts = defaultdict(int)
    for row in recent_reservations.order_by().values('lot__subdivision_id', 'lot__block').annotate(count=Count('id')):
        reservation_counts[(row['lot__subdivision_id'], row['lot__block'])] = row['count']
    for row in recent_sales.order_by().values('lot__subdivision_id', 'lot__block').annotate(count=Count('id')):
        sold_counts[(row['lot__subdivision_id'], row['lot__block'])] = row['count']

    max_reservations = max(reservation_counts.values(), default=0)
    max_sold = max(sold_counts.values(), default=0)

    model, probabilities = model_predictions(available_lots)
    predictions = []
    block_scores = defaultdict(list)
    for lot in available_lots:
        block_key = (lot.subdivision_id, lot.block)
        reservation_count = reservation_counts[block_key]
        sold_count = sold_counts[block_key]
        price = float(lot.price or 0)
        area = float(lot.area or 0)

        score = round(max(0, min(100, (
            normalize_score(reservation_count, max_reservations) * 45
            + normalize_score(sold_count, max_sold) * 25
            + (1 - normalize_score(price, max_price)) * 20
            + normalize_score(area, max_area) * 10
        ))), 2)
        probability = probabilities.get(lot.pk)
        if probability is not None:
            score = round(probability * 100, 2)
        label = lot_demand_label(score)
        block_scores[(lot.subdivision_id, lot.block)].append(score)

        predictions.append({
            'lot_id': lot.id,
            'lot_number': str(lot.lot_number),
            'block': lot.block,
            'phase': None,
            'subdivision': lot.subdivision.name if lot.subdivision else '',
            'area_sqm': area,
            'price': price,
            'lot_status': lot.status,
            'subdivision_id': lot.subdivision_id,
            'location_zone': lot.location_zone,
            'demand_score': score,
            'demand_probability': probability,
            'demand_label': label,
            'reasons': ['Model estimate from recorded lot features and recent requests'] if model else build_lot_demand_reasons(score, reservation_count, sold_count, price, float(average_price or 0)),
            'recommended_action': lot_demand_action(label),
            'signals': {
                'recent_reservations_same_block': reservation_count,
                'recent_sold_same_block': sold_count,
                'price_vs_available_average': round(price - float(average_price or 0), 2),
            },
        })

    if lot_id is not None:
        predictions = [item for item in predictions if item['lot_id'] == lot_id]
        block_scores = defaultdict(list)
        for item in predictions:
            block_scores[(item['subdivision_id'], item['block'])].append(item['demand_score'])
    predictions.sort(key=lambda item: (-item['demand_score'], item['lot_id']))
    label_counts = Counter(item['demand_label'] for item in predictions)
    most_in_demand_block = None
    if block_scores:
        most_in_demand_block = max(
            block_scores.items(),
            key=lambda item: sum(item[1]) / len(item[1]) if item[1] else 0,
        )[0][1]

    distribution_by_block = [
        {
            'block': block,
            'subdivision_id': subdivision,
            'average_score': round(sum(scores) / len(scores), 2) if scores else 0,
            'available_lots': len(scores),
        }
        for (subdivision, block), scores in sorted(block_scores.items(), key=lambda item: (str(item[0][0]), item[0][1]))
    ]

    return {
        'model_available': model is not None,
        'mode': 'ml_probability' if model else 'demand_score',
        'model_name': '30-day reservation demand logistic regression' if model else None,
        'trained_at': model.trained_at.isoformat() if model else None,
        'evaluation': model.parameters.get('evaluation') if model else None,
        'message': 'Estimated chance of a reservation request within 30 days, validated on later recorded outcomes.' if model else (
            'Insufficient historical data for machine-learning demand prediction. '
            'Showing a transparent demand score based on current lot records, recent reservations, and sales.'
        ),
        'training_status': lot_demand_training_status(),
        'features_used': [
            'Lot price',
            'Lot area',
            'Subdivision',
            'Block',
            'Recent reservation count in the same block',
            'Recent sold lots in the same block',
        ],
        'summary': {
            'available_lots': len(predictions),
            'high_demand_lots': label_counts['High Demand'],
            'moderate_demand_lots': label_counts['Moderate Demand'],
            'low_demand_lots': label_counts['Low Demand'],
            'most_in_demand_block': most_in_demand_block,
        },
        'predictions': predictions,
        'top_lots': predictions[:10],
        'distribution_by_block': distribution_by_block,
        # Legacy unfiltered callers retain their existing fields. Location
        # comparisons require an explicit subdivision and never pool projects.
        'subdivision_id': subdivision_id,
        'score_metric': 'demand_score',
        'score_scale': {'min': 0, 'max': 100, 'unit': 'points'},
        'distribution_by_zone': distribution_by_zone(predictions) if subdivision_id is not None else [],
    }


class LotDemandPredictionView(APIView):
    permission_classes = []

    def get(self, request):
        permission_error = require_role(
            request,
            REPORT_VIEW_ROLES,
            'Only admins and managers can view lot demand analytics.',
        )
        if permission_error:
            return permission_error

        subdivision_id = request.query_params.get('subdivision_id')
        if subdivision_id is not None:
            try:
                subdivision_id = int(subdivision_id)
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid subdivision_id.'}, status=status.HTTP_400_BAD_REQUEST)
            if not Subdivision.objects.filter(pk=subdivision_id).exists():
                return Response({'detail': 'Subdivision not found.'}, status=status.HTTP_404_NOT_FOUND)
        capture_observations()
        return Response(build_lot_demand_payload(subdivision_id=subdivision_id))


class LotDemandPredictionDetailView(APIView):
    permission_classes = []

    def get(self, request, lot_id):
        permission_error = require_role(
            request,
            REPORT_VIEW_ROLES,
            'Only admins and managers can view lot demand analytics.',
        )
        if permission_error:
            return permission_error

        lot = Lot.objects.filter(pk=lot_id, status='available').first()
        payload = build_lot_demand_payload(lot_id=lot_id, subdivision_id=lot.subdivision_id if lot else None)
        if not payload['predictions']:
            return Response({'detail': 'Available lot not found.'}, status=status.HTTP_404_NOT_FOUND)
        payload['prediction'] = payload['predictions'][0]
        return Response(payload)


class LotDemandTrainView(APIView):
    permission_classes = []

    def post(self, request):
        permission_error = require_role(
            request,
            REPORT_VIEW_ROLES,
            'Only admins and managers can train lot demand models.',
        )
        if permission_error:
            return permission_error

        training_status = train_model()
        payload = build_lot_demand_payload()
        return Response({key: payload[key] for key in ('model_available', 'mode', 'model_name', 'trained_at', 'evaluation')} |
                        {'training_status': training_status, 'message': training_status['message']})



class ReservationAnalyticsView(APIView):
    permission_classes = []

    def get(self, request):
        permission_error = require_role(
            request,
            REPORT_VIEW_ROLES,
            'Only admins and managers can view reservation analytics.',
        )
        if permission_error:
            return permission_error

        return Response(build_reservation_analytics(request.query_params))


def decimal_number(value):
    return float(value or 0)


def user_display_name(user):
    full_name = user.get_full_name().strip()
    return full_name or user.username or user.email or f'User {user.id}'


def filtered_performance_users(params):
    validate_analytics_filters(params)
    users = User.objects.filter(role='agent')
    user_id = params.get('user_id')

    if user_id:
        users = users.filter(pk=user_id)

    return users.order_by('role', 'last_name', 'first_name', 'username')


def filtered_performance_sales(params):
    validate_analytics_filters(params)
    sales = SaleTransaction.objects.select_related('agent', 'reservation', 'lot', 'lot__subdivision')
    start_date = parse_date(params.get('start_date') or '')
    end_date = parse_date(params.get('end_date') or '')
    year = params.get('year')
    subdivision_id = params.get('subdivision_id')
    reservation_status = normalized_reservation_status(params.get('reservation_status') or params.get('status'))

    if start_date:
        sales = sales.filter(sale_date__gte=start_date)
    if end_date:
        sales = sales.filter(sale_date__lte=end_date)
    if year:
        try:
            sales = sales.filter(sale_date__year=int(year))
        except (TypeError, ValueError):
            pass
    if subdivision_id:
        sales = sales.filter(lot__subdivision_id=subdivision_id)
    if reservation_status:
        if reservation_status == 'declined':
            sales = sales.filter(reservation__status__in=['declined', 'rejected'])
        else:
            sales = sales.filter(reservation__status=reservation_status)

    return sales


def filtered_performance_reservations(params):
    validate_analytics_filters(params)
    reservations = ReservationRequest.objects.select_related('reviewed_by', 'lot', 'lot__subdivision')
    start_date = parse_date(params.get('start_date') or '')
    end_date = parse_date(params.get('end_date') or '')
    year = params.get('year')
    subdivision_id = params.get('subdivision_id')
    reservation_status = normalized_reservation_status(params.get('reservation_status') or params.get('status'))

    if start_date:
        reservations = reservations.filter(created_at__date__gte=start_date)
    if end_date:
        reservations = reservations.filter(created_at__date__lte=end_date)
    if year:
        try:
            reservations = reservations.filter(created_at__year=int(year))
        except (TypeError, ValueError):
            pass
    if subdivision_id:
        reservations = reservations.filter(lot__subdivision_id=subdivision_id)
    if reservation_status:
        if reservation_status == 'declined':
            reservations = reservations.filter(status__in=['declined', 'rejected'])
        else:
            reservations = reservations.filter(status=reservation_status)

    return reservations


def build_top_performing_agents_analytics(params):
    users = list(filtered_performance_users(params))
    user_ids = [user.id for user in users]
    sales = filtered_performance_sales(params)

    agent_sales = {
        row['agent_id']: row
        for row in (
            sales
            .filter(agent_id__in=user_ids)
            .values('agent_id')
            .annotate(
                total_sales_amount=Sum('total_contract_price'),
                completed_sales=Count('id', distinct=True),
                converted_reservations=Count(
                    'reservation_id',
                    filter=Q(reservation_id__isnull=False),
                    distinct=True,
                ),
                direct_sales=Count(
                    'id',
                    filter=Q(reservation_id__isnull=True),
                    distinct=True,
                ),
                commission_earned=Sum('agent_commission'),
            )
        )
    }

    reservation_rows = {
        row['assigned_agent_id']: row for row in
        filtered_performance_reservations(params).filter(assigned_agent_id__in=user_ids)
        .annotate(converted=Exists(reservation_conversion_exists_query()))
        .values('assigned_agent_id').annotate(handled=Count('id'), converted_count=Count('id', filter=Q(converted=True)))
    }
    performance_data = []
    for user in users:
        sale_row = agent_sales.get(user.id)
        total_sales_amount = decimal_number(sale_row.get('total_sales_amount') if sale_row else 0)
        completed_sales = int(sale_row.get('completed_sales') if sale_row else 0)
        converted_reservations = int(sale_row.get('converted_reservations') if sale_row else 0)
        direct_sales = int(sale_row.get('direct_sales') if sale_row else 0)
        reservation_row = reservation_rows.get(user.id, {})
        reservations_handled = reservation_row.get('handled', 0)
        commission_earned = decimal_number(sale_row.get('commission_earned') if sale_row else 0)
        conversion_rate = round(reservation_row.get('converted_count', 0) / reservations_handled * 100, 2) if reservations_handled else None

        performance_data.append({
            'user_id': user.id,
            'name': user_display_name(user),
            'role': user.role,
            'total_sales_amount': total_sales_amount,
            'reservations_handled': reservations_handled,
            'completed_sales': completed_sales,
            'conversion_rate': conversion_rate,
            'commission_earned': commission_earned,
            'pending_commission': None,
            'linked_reservations': converted_reservations,
            'direct_sales': direct_sales,
            'status': 'active' if user.is_active else 'inactive',
        })

    performance_data = sorted(
        performance_data,
        key=lambda item: (
            item['total_sales_amount'],
            item['completed_sales'],
            item['user_id'],
        ),
        reverse=True,
    )
    for index, row in enumerate(performance_data, start=1):
        row['rank'] = index

    monthly_rows = []
    user_lookup = {user.id: user for user in users}
    rows = (
        sales
        .filter(agent_id__in=user_ids)
        .annotate(month=TruncMonth('sale_date'))
        .values('month', 'agent_id')
        .annotate(
            sales_amount=Sum('total_contract_price'),
            completed_sales=Count('id', distinct=True),
        )
        .order_by('month')
    )
    for row in rows:
        user = user_lookup.get(row['agent_id'])
        if not user:
            continue
        monthly_rows.append({
            'month': row['month'].strftime('%B %Y') if row['month'] else 'Unknown',
            'month_key': row['month'].strftime('%Y-%m') if row['month'] else '',
            'user_id': user.id,
            'name': user_display_name(user),
            'role': user.role,
            'sales_amount': decimal_number(row['sales_amount']),
            'completed_sales': int(row['completed_sales'] or 0),
        })

    overall_sales = sales.filter(agent_id__in=user_ids).distinct()
    top_performer = performance_data[0] if performance_data and performance_data[0]['completed_sales'] else None
    total_reservations_handled = sum(row['reservations_handled'] for row in performance_data)
    total_completed_sales = overall_sales.count()
    total_sales_amount = decimal_number(overall_sales.aggregate(total=Sum('total_contract_price'))['total'])
    overall_conversion_rate = (
        round((sum(row['converted_count'] for row in reservation_rows.values()) / total_reservations_handled) * 100, 2)
        if total_reservations_handled
        else None
    )

    return {
        'data_limitation_message': "Reservation counts and conversion rates use explicitly assigned reservations. Assign existing requests to include them. Commission payment status is not recorded; pending commission is unavailable.",
        'time_zone': timezone.get_current_timezone_name(),
        'agent_options': [{'id': user.id, 'name': user_display_name(user)} for user in User.objects.filter(role='agent').order_by('id')],
        'summary': {
            'total_agents': sum(1 for user in users if user.role == 'agent' and user.is_active),
            'total_sales_amount': round(total_sales_amount, 2),
            'total_reservations_handled': total_reservations_handled,
            'total_completed_sales': total_completed_sales,
            'overall_conversion_rate': overall_conversion_rate,
            'top_performer': {
                'user_id': top_performer['user_id'],
                'name': top_performer['name'],
                'role': top_performer['role'],
                'sales_amount': top_performer['total_sales_amount'],
                'completed_sales': top_performer['completed_sales'],
                'conversion_rate': top_performer['conversion_rate'],
            } if top_performer else None,
        },
        'performance_data': performance_data,
        'monthly_sales_performance': sorted(monthly_rows, key=lambda item: (item['month_key'], item['name'])),
        'top_sales_performers': performance_data[:10],
        'top_conversion_performers': sorted([row for row in performance_data if row['conversion_rate'] is not None], key=lambda row: (row['conversion_rate'], row['reservations_handled']), reverse=True)[:10],
        'commission_performance': sorted(
            performance_data,
            key=lambda item: item['commission_earned'],
            reverse=True,
        )[:10],
    }


def empty_agent_pipeline_response(message, active_count=None):
    return {
        'model_available': False,
        'model_name': None,
        'message': message,
        'summary': {
            'predicted_top_agent': None,
            'total_active_approved_reservations': active_count,
            'total_projected_pipeline_value': None,
        },
        'agent_pipeline_forecasts': [],
    }


def build_agent_sales_pipeline_forecast(params):
    return build_pipeline(params)


class TopPerformingAgentsAnalyticsView(APIView):
    permission_classes = []

    def get(self, request):
        permission_error = require_role(
            request,
            REPORT_VIEW_ROLES,
            'Only admins and managers can view top performing agents analytics.',
        )
        if permission_error:
            return permission_error

        return Response(build_top_performing_agents_analytics(request.query_params))


class AgentSalesPipelineForecastView(APIView):
    permission_classes = []

    def get(self, request):
        permission_error = require_role(
            request,
            REPORT_VIEW_ROLES,
            'Only admins and managers can view agent sales pipeline forecasts.',
        )
        if permission_error:
            return permission_error

        return Response(build_agent_sales_pipeline_forecast(request.query_params))


class LotListView(APIView):
    permission_classes = []

    def get(self, request):
        approved_reservations = (
            ReservationRequest.objects
            .select_related('client', 'reviewed_by')
            .filter(status='approved')
            .order_by('-reviewed_at', '-created_at')
        )
        lots = Lot.objects.prefetch_related(
            Prefetch(
                'reservation_requests',
                queryset=approved_reservations,
                to_attr='approved_reservations',
            )
        )
        subdivision_id = request.query_params.get('subdivision_id')
        if subdivision_id:
            lots = lots.filter(subdivision_id=subdivision_id)

        return Response(LotSerializer(lots, many=True).data)

    def post(self, request):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        blueprint_id = request.data.get('blueprint')
        if blueprint_id:
            try:
                blueprint = Blueprint.objects.get(pk=blueprint_id)
            except (Blueprint.DoesNotExist, ValueError):
                return Response({'detail': 'Blueprint not found.'}, status=status.HTTP_404_NOT_FOUND)

            coordinates = lot_points_to_coordinates(request.data)
            if len(coordinates) < 3:
                return Response({'detail': 'At least three polygon points are required.'}, status=status.HTTP_400_BAD_REQUEST)

            lot_status = request.data.get('status') or 'available'
            valid_statuses = {choice[0] for choice in BlueprintLot.STATUS_CHOICES}
            if lot_status not in valid_statuses:
                lot_status = 'available'

            lot = BlueprintLot.objects.create(
                blueprint=blueprint,
                lot_number=str(request.data.get('lot_number') or request.data.get('lot') or 'Lot'),
                block_number=str(request.data.get('block_number') or request.data.get('block') or '').strip(),
                size=request.data.get('size') or request.data.get('area') or request.data.get('area_sqm'),
                frontage=request.data.get('frontage'),
                depth=request.data.get('depth'),
                price=request.data.get('price') or None,
                status=lot_status,
                category=str(item.get('category') or item.get('model') or '').strip(),
                model=str(item.get('model') or item.get('category') or '').strip(),
                coordinates=coordinates,
                polygon_coordinates=coordinates,
                confidence_score=float(item.get('confidence_score') or 0),
                is_ai_detected=bool(item.get('is_ai_detected', True)),
            )
            return Response(BlueprintLotSerializer(lot).data, status=status.HTTP_201_CREATED)

        return Response({'detail': 'Blueprint is required to create an interactive lot polygon.'}, status=status.HTTP_400_BAD_REQUEST)


class LotDetailView(APIView):
    permission_classes = []

    def patch(self, request, pk):
        return self.put(request, pk)

    def put(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            lot = Lot.objects.get(pk=pk)
        except Lot.DoesNotExist:
            return Response({'detail': 'Lot not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = LotSerializer(lot, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
            if 'location_zone' in serializer.validated_data:
                matching_blueprint_lots_for_lot(lot).update(location_zone=lot.location_zone)
        return Response(serializer.data)


class LotOccupyView(APIView):
    permission_classes = []

    def post(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        return update_lot_status(pk, 'occupied')


class LotReserveView(APIView):
    permission_classes = []

    def post(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        return update_lot_status(pk, 'reserved')


class LotUnoccupyView(APIView):
    permission_classes = []

    def post(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        return update_lot_status(pk, 'available')


def update_lot_status(pk, next_status):
    try:
        lot = Lot.objects.get(pk=pk)
    except Lot.DoesNotExist:
        return Response({'detail': 'Lot not found.'}, status=status.HTTP_404_NOT_FOUND)

    lot.status = next_status
    lot.save(update_fields=['status'])

    if next_status in ['available', 'occupied']:
        ReservationRequest.objects.filter(lot=lot, status='pending').update(status='declined')

    return Response(LotSerializer(lot).data)


def blueprint_lot_to_reservation_lot(blueprint_lot):
    synced_lot = sync_blueprint_lot(blueprint_lot)
    if synced_lot is not None:
        return synced_lot
    subdivision_name = blueprint_lot.blueprint.title or 'Subdivision Blueprint'
    subdivision, _ = Subdivision.objects.get_or_create(name=subdivision_name)
    lot_number_text = str(blueprint_lot.lot_number or '').strip()
    lot_number_digits = ''.join(character for character in lot_number_text if character.isdigit())
    lot_number = int(lot_number_digits) if lot_number_digits else 0
    area_value = blueprint_lot.area_sqm or blueprint_lot.size or 0

    try:
        area = max(int(float(area_value or 0)), 1)
    except (TypeError, ValueError):
        area = 1

    lot, _ = Lot.objects.get_or_create(
        subdivision=subdivision,
        block=blueprint_lot.block_number or '',
        lot_number=lot_number,
        defaults={
            'area': area,
            'price': blueprint_lot.price or 0,
            'location_zone': blueprint_lot.location_zone,
            'status': blueprint_lot.status if blueprint_lot.status in {'available', 'pending', 'reserved', 'sold', 'unavailable', 'occupied'} else 'available',
            'polygon_points': blueprint_lot.polygon_coordinates or blueprint_lot.coordinates or [],
        },
    )

    return lot


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


class LotPhotoView(APIView):
    permission_classes = []

    def post(self, request, pk):
        permission_error = require_role(request, ['client'], 'Only clients can upload lot photos.')
        if permission_error:
            return permission_error

        photo_data = request.data.get('photo_data', '')
        if not photo_data:
            return Response({'detail': 'Photo is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(photo_data) > 2500000:
            return Response({'detail': 'Photo is too large.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lot = Lot.objects.get(pk=pk)
        except Lot.DoesNotExist:
            return Response({'detail': 'Lot not found.'}, status=status.HTTP_404_NOT_FOUND)

        lot.photo_data = photo_data
        lot.save(update_fields=['photo_data'])

        return Response(LotSerializer(lot).data)


class ReservationRequestListCreateView(APIView):
    permission_classes = []

    def get(self, request):
        auth_error = require_authenticated(request)
        if auth_error:
            return auth_error

        requests = ReservationRequest.objects.select_related('lot', 'client', 'reviewed_by')

        if request.user.is_authenticated and request.user.role == 'client':
            requests = requests.filter(client=request.user)

        return Response(ReservationRequestSerializer(requests, many=True).data)

    def post(self, request):
        permission_error = require_role(request, ['client'], 'Only clients can submit reservation requests.')
        if permission_error:
            return permission_error

        serializer = ReservationRequestSerializer(data=request.data)
        uses_blueprint_lot = False
        if serializer.is_valid():
            lot = serializer.validated_data['lot']
            blueprint_lot = None
        else:
            lot = None
            blueprint_lot = None
            uses_blueprint_lot = True
            lot_id = request.data.get('lot_id')
            try:
                blueprint_lot = BlueprintLot.objects.select_related('blueprint').get(pk=lot_id)
            except (BlueprintLot.DoesNotExist, TypeError, ValueError):
                serializer.is_valid(raise_exception=True)

            if blueprint_lot.blueprint.status != 'published':
                return Response({'detail': 'This blueprint lot is not available for reservation yet.'}, status=status.HTTP_400_BAD_REQUEST)
            lot = blueprint_lot_to_reservation_lot(blueprint_lot)

        if lot.status != 'available':
            return Response({'detail': 'This lot is not available.'}, status=status.HTTP_400_BAD_REQUEST)

        existing_request = ReservationRequest.objects.filter(
            client=request.user,
            lot=lot,
            status='pending',
        ).first()
        if existing_request:
            return Response(
                ReservationRequestSerializer(existing_request).data,
                status=status.HTTP_200_OK,
            )

        reservation_request = (
            ReservationRequest.objects.create(client=request.user, lot=lot)
            if uses_blueprint_lot
            else serializer.save(client=request.user)
        )
        lot.status = 'pending'
        lot.save(update_fields=['status'])
        if blueprint_lot:
            blueprint_lot.status = 'pending'
            blueprint_lot.save(update_fields=['status'])
        else:
            sync_blueprint_lot_status(lot, 'pending')

        staff_users = User.objects.filter(role__in=STAFF_ROLES)
        notifications = [
            Notification(
                user=staff,
                reservation_request=reservation_request,
                title='New reservation request',
                message=f'{request.user.username} requested {lot.block}, Lot {lot.lot_number}.',
            )
            for staff in staff_users
        ]
        Notification.objects.bulk_create(notifications)

        return Response(
            ReservationRequestSerializer(reservation_request).data,
            status=status.HTTP_201_CREATED,
        )


class ReservationAgentOptionsView(APIView):
    permission_classes = []

    def get(self, request):
        error = require_reservation_reviewer(request)
        if error:
            return error
        return Response([{'id': user.id, 'name': user_display_name(user)}
                         for user in User.objects.filter(role='agent', is_active=True).order_by('id')])


class ReservationAgentAssignmentView(APIView):
    permission_classes = []

    def patch(self, request, pk):
        error = require_reservation_reviewer(request)
        if error:
            return error
        with transaction.atomic():
            reservation = ReservationRequest.objects.select_for_update().filter(pk=pk).first()
            if not reservation:
                return Response({'detail': 'Reservation not found.'}, status=404)
            if reservation.sales.exists():
                return Response({'detail': 'A completed reservation cannot be reassigned.'}, status=400)
            if 'assigned_agent' not in request.data:
                return Response({'detail': 'assigned_agent is required (use null to unassign).'}, status=400)
            agent_id = request.data['assigned_agent']
            agent = None
            if agent_id is not None:
                try:
                    agent = User.objects.filter(pk=int(agent_id), role='agent', is_active=True).first()
                except (ValueError, TypeError):
                    pass
                if not agent:
                    return Response({'detail': 'Select an active agent.'}, status=400)
            reservation.assigned_agent = agent
            reservation.save(update_fields=['assigned_agent'])
        return Response(ReservationRequestSerializer(reservation).data)


class ReservationRequestApproveView(APIView):
    permission_classes = []

    def post(self, request, pk):
        permission_error = require_reservation_reviewer(request)
        if permission_error:
            return permission_error

        try:
            reservation_request = ReservationRequest.objects.select_related('lot', 'client').get(pk=pk)
        except ReservationRequest.DoesNotExist:
            return Response({'detail': 'Reservation request not found.'}, status=status.HTTP_404_NOT_FOUND)

        if reservation_request.status == 'approved':
            return Response(ReservationRequestSerializer(reservation_request).data)

        reservation_request.status = 'approved'
        reservation_request.reviewed_by = request.user if request.user.is_authenticated else None
        reservation_request.reviewed_at = timezone.now()
        reservation_request.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        lot = reservation_request.lot
        lot.status = 'reserved'
        lot.save(update_fields=['status'])
        sync_blueprint_lot_status(lot, 'reserved')

        ReservationRequest.objects.filter(
            lot=lot,
            status='pending',
        ).exclude(pk=reservation_request.pk).update(status='declined')

        Notification.objects.create(
            user=reservation_request.client,
            reservation_request=reservation_request,
            title='Reservation approved',
            message=f'Your reservation for {lot.block}, Lot {lot.lot_number} has been approved. This lot is now reserved for you.',
        )

        return Response(ReservationRequestSerializer(reservation_request).data)


class ReservationRequestDeclineView(APIView):
    permission_classes = []

    def post(self, request, pk):
        permission_error = require_reservation_reviewer(request)
        if permission_error:
            return permission_error

        try:
            reservation_request = ReservationRequest.objects.select_related('lot', 'client').get(pk=pk)
        except ReservationRequest.DoesNotExist:
            return Response({'detail': 'Reservation request not found.'}, status=status.HTTP_404_NOT_FOUND)

        if reservation_request.status in ['declined', 'rejected']:
            return Response(ReservationRequestSerializer(reservation_request).data)

        reservation_request.status = 'declined'
        reservation_request.reviewed_by = request.user if request.user.is_authenticated else None
        reservation_request.reviewed_at = timezone.now()
        reservation_request.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        lot = reservation_request.lot
        if lot.reservation_requests.filter(status='approved').exists():
            next_status = 'reserved'
        elif lot.reservation_requests.filter(status='pending').exists():
            next_status = 'pending'
        else:
            next_status = 'available'
        if lot.status != next_status:
            lot.status = next_status
            lot.save(update_fields=['status'])
        sync_blueprint_lot_status(lot, next_status)

        Notification.objects.create(
            user=reservation_request.client,
            reservation_request=reservation_request,
            title='Reservation declined',
            message=f'Your reservation for {lot.block}, Lot {lot.lot_number} has been declined.',
        )

        return Response(ReservationRequestSerializer(reservation_request).data)


class NotificationListView(APIView):
    permission_classes = []

    def get(self, request):
        notifications = Notification.objects.select_related('reservation_request')

        if request.user.is_authenticated:
            notifications = notifications.filter(user=request.user)

        return Response(NotificationSerializer(notifications, many=True).data)


def parse_blueprint_data_url(blueprint_data):
    match = re.match(r'^data:(?P<mime>image/[^;]+);base64,(?P<data>.+)$', str(blueprint_data), re.DOTALL)
    if not match:
        return None, None

    try:
        return match.group('mime'), base64.b64decode(match.group('data'), validate=True)
    except (TypeError, ValueError):
        return None, None


def image_bytes_to_data_url(image_bytes, mime_type):
    encoded = base64.b64encode(image_bytes).decode('ascii')
    return f'data:{mime_type or "image/png"};base64,{encoded}'


def extract_blueprint_upload(request):
    title = (request.data.get('title') or request.data.get('name') or '').strip()
    upload = (
        request.FILES.get('image')
        or request.FILES.get('blueprint_image')
        or request.FILES.get('file')
        or request.FILES.get('blueprint')
    )

    if upload:
        if not title:
            title = upload.name
        mime_type = upload.content_type or mimetypes.guess_type(upload.name)[0] or 'image/png'
        image_bytes = upload.read()
        return title, mime_type, image_bytes, image_bytes_to_data_url(image_bytes, mime_type)

    blueprint_data = request.data.get('blueprint_data') or request.data.get('image_data') or ''
    mime_type, image_bytes = parse_blueprint_data_url(blueprint_data)
    return title, mime_type, image_bytes, blueprint_data


def upload_blueprint_to_supabase(image_bytes, mime_type, title):
    if not image_bytes:
        raise ValueError('Please upload a valid image file.')

    supabase_url = str(os.getenv('SUPABASE_URL') or getattr(settings, 'SUPABASE_URL', '') or '').rstrip('/')
    service_role_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', '') or ''
    bucket = os.getenv('SUPABASE_STORAGE_BUCKET', getattr(settings, 'SUPABASE_STORAGE_BUCKET', 'blueprints') or 'blueprints')

    missing_settings = []
    if not supabase_url:
        missing_settings.append('SUPABASE_URL')
    if not service_role_key:
        missing_settings.append('SUPABASE_SERVICE_ROLE_KEY')

    if missing_settings:
        raise ValueError(
            'Supabase storage is not configured. Missing '
            f'{", ".join(missing_settings)}.'
        )

    if not re.match(r'^https://[a-zA-Z0-9-]+\.supabase\.co$', supabase_url):
        raise ValueError('SUPABASE_URL must use the full format https://project-ref.supabase.co.')

    extension = mimetypes.guess_extension(mime_type or 'image/png') or '.png'
    safe_title = re.sub(r'[^a-zA-Z0-9_-]+', '-', title.strip().lower()).strip('-') or 'blueprint'
    storage_path = f'{safe_title}/{uuid.uuid4()}{extension}'
    object_path = quote(storage_path, safe='/')
    upload_url = f'{supabase_url}/storage/v1/object/{bucket}/{object_path}'

    request = Request(
        upload_url,
        data=image_bytes,
        method='POST',
        headers={
            'Authorization': f'Bearer {service_role_key}',
            'apikey': service_role_key,
            'Content-Type': mime_type or 'application/octet-stream',
            'x-upsert': 'true',
        },
    )
    try:
        with urlopen(request, timeout=45) as response:
            if response.status >= 400:
                raise SupabaseStorageError('Supabase bucket upload failed', f'Status {response.status}')
    except HTTPError as error:
        try:
            details = error.read().decode('utf-8', errors='replace')
        except Exception:
            details = ''
        if error.code == 404:
            raise SupabaseStorageError(
                'Supabase bucket upload failed',
                details or f'Supabase Storage bucket "{bucket}" was not found. Create the bucket, then retry.',
            )
        if error.code in [401, 403]:
            raise SupabaseStorageError(
                'Supabase bucket upload failed',
                details or 'Supabase Storage rejected the service role key. Check SUPABASE_SERVICE_ROLE_KEY.',
            )
        raise SupabaseStorageError(
            'Supabase bucket upload failed',
            details or f'Supabase Storage upload failed with status {error.code}.',
        )
    except URLError as error:
        raise SupabaseStorageError(
            'Supabase bucket upload failed',
            f'Unable to reach Supabase Storage. Check SUPABASE_URL and network access. {error.reason}',
        )

    public_url = f'{supabase_url}/storage/v1/object/public/{bucket}/{object_path}'
    return public_url, storage_path


def create_blueprint_signed_url(storage_path):
    if not storage_path:
        return '', 'No Supabase storage path was saved for this blueprint.'

    supabase_url = str(os.getenv('SUPABASE_URL') or getattr(settings, 'SUPABASE_URL', '') or '').rstrip('/')
    service_role_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', '') or ''
    bucket = os.getenv('SUPABASE_STORAGE_BUCKET', getattr(settings, 'SUPABASE_STORAGE_BUCKET', 'blueprints') or 'blueprints')
    if not supabase_url or not service_role_key:
        return '', 'Supabase signing is not configured on the backend.'

    sign_url = f'{supabase_url}/storage/v1/object/sign/{bucket}/{quote(storage_path, safe="/")}'
    request = Request(
        sign_url,
        data=json.dumps({'expiresIn': 60 * 60 * 24}).encode('utf-8'),
        method='POST',
        headers={
            'Authorization': f'Bearer {service_role_key}',
            'apikey': service_role_key,
            'Content-Type': 'application/json',
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except HTTPError as error:
        try:
            details = error.read().decode('utf-8', errors='replace')
        except Exception:
            details = ''
        return '', details or f'Supabase signed URL request failed with status {error.code}.'
    except URLError as error:
        return '', f'Unable to reach Supabase Storage while signing URL. {error.reason}'
    except Exception as error:
        return '', f'Unable to create Supabase signed URL. {error}'

    signed_url = payload.get('signedURL') or payload.get('signedUrl') or payload.get('url') or ''
    if not signed_url:
        return '', 'Supabase did not return a signed URL for this blueprint.'

    signed_url = str(signed_url)
    if signed_url.startswith('http://') or signed_url.startswith('https://'):
        return signed_url, ''
    if signed_url.startswith('/storage/v1/'):
        return f'{supabase_url}{signed_url}', ''
    if signed_url.startswith('/'):
        return f'{supabase_url}/storage/v1{signed_url}', ''
    return f'{supabase_url}/storage/v1/{signed_url.lstrip("/")}', ''


def is_supabase_bucket_public(bucket):
    if bucket in SUPABASE_BUCKET_PUBLIC_CACHE:
        return SUPABASE_BUCKET_PUBLIC_CACHE[bucket]

    supabase_url = str(os.getenv('SUPABASE_URL') or getattr(settings, 'SUPABASE_URL', '') or '').rstrip('/')
    service_role_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', '') or ''
    if not supabase_url or not service_role_key:
        SUPABASE_BUCKET_PUBLIC_CACHE[bucket] = False
        return False

    request = Request(
        f'{supabase_url}/storage/v1/bucket/{quote(bucket, safe="")}',
        method='GET',
        headers={
            'Authorization': f'Bearer {service_role_key}',
            'apikey': service_role_key,
        },
    )

    try:
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode('utf-8'))
            is_public = bool(payload.get('public'))
    except Exception:
        is_public = False

    SUPABASE_BUCKET_PUBLIC_CACHE[bucket] = is_public
    return is_public


def blueprint_response_data(blueprint):
    data = BlueprintSerializer(blueprint).data
    if is_uniform_grid_overlay(data.get('lots') or []):
        data['lots'] = []
        data['detection_message'] = BLUEPRINT_DETECTION_ERROR
    public_url = data.get('image_url') or ''
    stored_display_url = data.get('display_url') or ''
    bucket = os.getenv('SUPABASE_STORAGE_BUCKET', getattr(settings, 'SUPABASE_STORAGE_BUCKET', 'blueprints') or 'blueprints')
    bucket_is_public = is_supabase_bucket_public(bucket)
    signed_url, signed_error = ('', '') if bucket_is_public else create_blueprint_signed_url(
        data.get('storage_path') or getattr(blueprint, 'storage_path', '')
    )
    display_url = public_url if bucket_is_public else signed_url or stored_display_url or public_url
    data['display_url'] = display_url
    data['public_url'] = public_url
    data['blueprint_data'] = display_url
    data['storage_bucket'] = bucket
    data['storage_bucket_public'] = bucket_is_public
    if signed_error and not public_url:
        data['display_url_error'] = signed_error
    elif signed_error:
        data['display_url_warning'] = signed_error
    return data


def blueprint_tables_exist():
    try:
        table_names = set(connection.introspection.table_names())
    except Exception:
        return True
    return {'blueprints', 'lots'}.issubset(table_names)


def normalize_coordinate_value(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if number > 1:
        number = number / 100

    return max(0, min(1, round(number, 6)))


def normalize_coordinate_pairs(points):
    normalized = []
    for point in points:
        try:
            if isinstance(point, dict):
                x = normalize_coordinate_value(point.get('x'))
                y = normalize_coordinate_value(point.get('y'))
            else:
                x = normalize_coordinate_value(point[0])
                y = normalize_coordinate_value(point[1])
        except (TypeError, IndexError):
            continue

        if x is None or y is None:
            continue

        normalized.append([x, y])

    return normalized


def polygon_area(points):
    if len(points) < 3:
        return 0

    total = 0
    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        total += point[0] * next_point[1] - next_point[0] * point[1]
    return abs(total) / 2


def polygon_bounds(points):
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    return {
        'min_x': min_x,
        'max_x': max_x,
        'min_y': min_y,
        'max_y': max_y,
        'width': max_x - min_x,
        'height': max_y - min_y,
        'area': (max_x - min_x) * (max_y - min_y),
    }


def lot_payload_coordinates(item):
    if isinstance(item, dict):
        return normalize_coordinate_pairs(item.get('coordinates') or item.get('polygon_points') or item.get('points') or [])

    coordinates = getattr(item, 'coordinates', [])
    return normalize_coordinate_pairs(coordinates)


def is_uniform_grid_overlay(lots):
    if len(lots) != 64:
        return False

    rectangles = []
    for item in lots:
        points = lot_payload_coordinates(item)
        if len(points) != 4:
            return False
        rectangles.append(polygon_bounds(points))

    widths = [rect['width'] for rect in rectangles]
    heights = [rect['height'] for rect in rectangles]
    avg_width = sum(widths) / len(widths)
    avg_height = sum(heights) / len(heights)
    if avg_width <= 0 or avg_height <= 0:
        return False

    same_sized_cells = all(
        abs(rect['width'] - avg_width) <= avg_width * 0.08 and
        abs(rect['height'] - avg_height) <= avg_height * 0.08
        for rect in rectangles
    )
    if not same_sized_cells:
        return False

    columns = {round(rect['min_x'], 2) for rect in rectangles}
    rows = {round(rect['min_y'], 2) for rect in rectangles}
    return len(columns) == 8 and len(rows) == 8


def is_individual_lot_polygon(points):
    if len(points) < 3:
        return False

    area = polygon_area(points)
    bounds = polygon_bounds(points)
    width = bounds['width']
    height = bounds['height']
    if width <= 0 or height <= 0:
        return False

    aspect_ratio = max(width / height, height / width)
    fill_ratio = area / bounds['area'] if bounds['area'] else 0

    if area < 0.00008 or area > 0.065:
        return False
    if width > 0.42 or height > 0.42:
        return False
    if aspect_ratio > 6:
        return False
    if fill_ratio < 0.28:
        return False

    return True


def strip_code_fence(value):
    text = str(value or '').strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?', '', text, flags=re.IGNORECASE).strip()
        text = re.sub(r'```$', '', text).strip()
    return text


def normalize_ai_lot_payload(payload):
    lots = payload.get('lots') if isinstance(payload, dict) else payload
    if not isinstance(lots, list):
        return []

    normalized_lots = []
    for index, item in enumerate(lots):
        if not isinstance(item, dict):
            continue

        coordinates = normalize_coordinate_pairs(item.get('coordinates') or item.get('polygon_points') or item.get('points') or [])
        if not is_individual_lot_polygon(coordinates):
            continue

        normalized_lots.append({
            'lot_number': str(item.get('lot_number') or f'Lot {index + 1}'),
            'block_number': str(item.get('block_number') or item.get('block') or '').strip(),
            'coordinates': coordinates,
            'status': item.get('status') if item.get('status') in ['available', 'reserved', 'sold', 'open_space', 'unavailable'] else 'available',
            'price': item.get('price'),
            'area_sqm': item.get('area_sqm') or item.get('area') or item.get('size'),
            'size': item.get('size') or item.get('area_sqm') or item.get('area'),
            'category': item.get('category') or item.get('model') or '',
            'model': item.get('model') or item.get('category') or '',
            'confidence_score': item.get('confidence_score') or item.get('confidence') or 0.65,
            'is_ai_detected': True,
            'frontage': item.get('frontage'),
            'depth': item.get('depth'),
        })

    if is_uniform_grid_overlay(normalized_lots):
        return []

    return normalized_lots


def contour_to_normalized_polygon(contour, image_width, image_height):
    import cv2

    perimeter = cv2.arcLength(contour, True)
    approximation = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
    points = approximation.reshape(-1, 2)

    if len(points) < 4:
        rectangle = cv2.boxPoints(cv2.minAreaRect(contour))
        points = rectangle.astype('int')

    if len(points) > 10:
        return []

    center = points.mean(axis=0)
    ordered = sorted(
        points.tolist(),
        key=lambda point: (
            math.atan2(point[1] - center[1], point[0] - center[0])
        ),
    )

    return [
        [
            round(max(0, min(image_width, point[0])) / image_width, 6),
            round(max(0, min(image_height, point[1])) / image_height, 6),
        ]
        for point in ordered
    ]


def bbox_overlap_ratio(first, second):
    first_x, first_y, first_w, first_h = first
    second_x, second_y, second_w, second_h = second
    left = max(first_x, second_x)
    top = max(first_y, second_y)
    right = min(first_x + first_w, second_x + second_w)
    bottom = min(first_y + first_h, second_y + second_h)
    if right <= left or bottom <= top:
        return 0

    intersection = (right - left) * (bottom - top)
    smaller_area = min(first_w * first_h, second_w * second_h)
    return intersection / smaller_area if smaller_area else 0


def detect_blueprint_lots_with_opencv(image_bytes):
    try:
        import cv2
        import numpy as np
    except ImportError:
        return []

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        return []

    image_height, image_width = image.shape[:2]
    if image_width < 100 or image_height < 100:
        return []

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    threshold = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        8,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(threshold, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    image_area = image_width * image_height
    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        area_ratio = area / image_area
        if area_ratio < 0.00035 or area_ratio > 0.08:
            continue

        x, y, width, height = cv2.boundingRect(contour)
        if width < 18 or height < 18:
            continue

        aspect_ratio = max(width / height, height / width)
        if aspect_ratio > 7:
            continue

        polygon = contour_to_normalized_polygon(contour, image_width, image_height)
        if not is_individual_lot_polygon(polygon):
            continue

        candidates.append({
            'bbox': (x, y, width, height),
            'area': area,
            'polygon': polygon,
        })

    candidates.sort(key=lambda item: item['area'], reverse=True)
    accepted = []
    for candidate in candidates:
        if any(bbox_overlap_ratio(candidate['bbox'], item['bbox']) > 0.65 for item in accepted):
            continue
        accepted.append(candidate)

    accepted.sort(key=lambda item: (item['bbox'][1], item['bbox'][0]))
    return [
        {
            'lot_number': f'Lot {index + 1}',
            'block_number': '',
            'coordinates': item['polygon'],
            'status': 'available',
            'price': None,
            'size': None,
            'frontage': None,
            'depth': None,
            'category': '',
            'model': '',
            'confidence_score': 0.72,
            'is_ai_detected': True,
        }
        for index, item in enumerate(accepted)
    ]


def analyze_blueprint_with_ai(blueprint_data):
    api_key = getattr(settings, 'AI_API_KEY', '') or ''
    if not api_key:
        return []

    try:
        from openai import OpenAI
    except ImportError:
        return []

    prompt = """
You are analyzing a subdivision blueprint image for a real estate lot map.
Return JSON only. Do not include markdown or explanations.

Detect ONLY actual individual residential lot parcel areas: closed rectangular, trapezoid, or irregular polygon lot parcels with clear boundaries.
Ignore roads, road labels, property lines, page/document borders, title blocks, compass/north arrow, scale bars, logos, vicinity maps, trees, ponds, measurement labels, consultant/client tables, and decorative elements.
Do not return bounding boxes around groups of lots, blocks, roads, open spaces, or the entire page.
Do not merge adjacent lots. Each visible lot must be its own polygon.
Use the actual parcel boundary points, not a simplified large rectangle, when a lot edge is angled or irregular.
If a lot is angled, return a trapezoid or polygon matching that visible shape.
Do not include long thin road-like shapes or large block outlines.

Return this JSON object shape:
{"lots": []}

Each item in lots must have:
- lot_number: string like "Lot 1". If unreadable, assign sequential lot numbers in reading order.
- block_number: string, empty when unreadable.
- coordinates: polygon points as normalized [x, y] pairs from 0 to 1 relative to the full image size.
- status: "available"
- price: null
- size: null
- frontage: null
- depth: null

Only include parcels you are confident are individual lots. If you cannot accurately separate the lot boundaries, return {"lots": []}.
"""

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=getattr(settings, 'AI_VISION_MODEL', 'gpt-4o-mini'),
            messages=[
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': prompt},
                        {'type': 'image_url', 'image_url': {'url': blueprint_data}},
                    ],
                }
            ],
            response_format={'type': 'json_object'},
            temperature=0,
        )
        content = response.choices[0].message.content
        payload = json.loads(strip_code_fence(content))
        return normalize_ai_lot_payload(payload)
    except Exception:
        return []


def build_data_url(image_bytes, mime_type):
    encoded = base64.b64encode(image_bytes).decode('ascii')
    return f'data:{mime_type or "image/png"};base64,{encoded}'


def polygon_centroid(points):
    if not points:
        return [0, 0]
    return [sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)]


def centroid_distance(first, second):
    return math.sqrt((first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2)


def merge_detected_lots_with_ai_metadata(boundary_lots, ai_lots):
    if not boundary_lots:
        return ai_lots
    if not ai_lots:
        return boundary_lots

    ai_by_centroid = [
        {**item, 'centroid': polygon_centroid(lot_points_to_coordinates(item))}
        for item in ai_lots
    ]
    merged = []
    for index, lot in enumerate(boundary_lots):
        coordinates = lot_points_to_coordinates(lot)
        centroid = polygon_centroid(coordinates)
        nearest = None
        nearest_distance = 999
        for ai_item in ai_by_centroid:
            distance = centroid_distance(centroid, ai_item['centroid'])
            if distance < nearest_distance:
                nearest = ai_item
                nearest_distance = distance

        metadata = nearest if nearest and nearest_distance < 0.12 else {}
        merged.append({
            **lot,
            'lot_number': metadata.get('lot_number') or lot.get('lot_number') or f'Lot {index + 1}',
            'block_number': metadata.get('block_number') or lot.get('block_number') or '',
            'status': metadata.get('status') or lot.get('status') or 'available',
            'price': metadata.get('price') if metadata.get('price') not in ['', None] else lot.get('price'),
            'area_sqm': metadata.get('area_sqm') or metadata.get('area') or metadata.get('size') or lot.get('area_sqm') or lot.get('size'),
            'size': metadata.get('size') or metadata.get('area_sqm') or metadata.get('area') or lot.get('size'),
            'category': metadata.get('category') or metadata.get('model') or lot.get('category') or '',
            'model': metadata.get('model') or metadata.get('category') or lot.get('model') or '',
            'confidence_score': max(float(lot.get('confidence_score') or 0), float(metadata.get('confidence_score') or 0.65)),
            'is_ai_detected': True,
        })
    return merged


def process_blueprint_detection(blueprint, image_bytes, blueprint_data):
    blueprint.status = 'processing'
    blueprint.processing_status = 'processing'
    blueprint.save(update_fields=['status', 'processing_status'])

    boundary_lots = detect_blueprint_lots_with_opencv(image_bytes)
    ai_lots = analyze_blueprint_with_ai(blueprint_data)
    detected_lots = merge_detected_lots_with_ai_metadata(boundary_lots, ai_lots)
    saved_lots = save_blueprint_lots(blueprint, detected_lots)

    blueprint.status = 'review' if saved_lots else 'failed'
    blueprint.processing_status = 'completed' if saved_lots else 'failed'
    blueprint.save(update_fields=['status', 'processing_status'])
    return saved_lots

def lot_points_to_coordinates(item):
    coordinates = item.get('polygon_coordinates') or item.get('coordinates') or []
    if coordinates:
        return normalize_coordinate_pairs(coordinates)

    points = item.get('polygon_points') or item.get('points') or []
    return normalize_coordinate_pairs(points)


def save_blueprint_lots(blueprint, detected_lots):
    normalized_lots = []

    if is_uniform_grid_overlay(detected_lots):
        return []

    with transaction.atomic():
        blueprint.lots.all().delete()

        for index, item in enumerate(detected_lots):
            coordinates = lot_points_to_coordinates(item)
            if not is_individual_lot_polygon(coordinates):
                continue
            price = item.get('price')
            if price in ['', None]:
                price = None
            area_sqm = item.get('area_sqm') or item.get('area') or item.get('size')
            if area_sqm in ['', None]:
                area_sqm = None
            lot_number = str(item.get('lot_number') or item.get('lot') or f'Lot {index + 1}')
            if lot_number.isdigit():
                lot_number = f'Lot {lot_number}'
            lot_status = item.get('status') if item.get('status') in ['available', 'reserved', 'sold', 'open_space', 'unavailable'] else 'available'

            lot = BlueprintLot.objects.create(
                blueprint=blueprint,
                lot_number=lot_number,
                block_number=str(item.get('block_number') or item.get('block') or '').strip(),
                area_sqm=area_sqm,
                size=item.get('size') or area_sqm,
                frontage=item.get('frontage'),
                depth=item.get('depth'),
                price=price,
                status=lot_status,
                category=str(item.get('category') or item.get('model') or '').strip(),
                model=str(item.get('model') or item.get('category') or '').strip(),
                coordinates=coordinates,
                polygon_coordinates=coordinates,
                confidence_score=float(item.get('confidence_score') or 0),
                is_ai_detected=bool(item.get('is_ai_detected', True)),
            )
            normalized_lots.append(lot)

    return normalized_lots


def save_detected_lots(subdivision, detected_lots):
    saved_lot_ids = []
    normalized_lots = []

    with transaction.atomic():
        for index, item in enumerate(detected_lots):
            cleaned = clean_mapped_lot(item, subdivision, index)
            if len(cleaned['polygon_points']) < 3:
                continue

            cleaned.pop('id', None)
            lot_instance = Lot.objects.filter(
                subdivision=subdivision,
                block=cleaned['block'],
                lot_number=cleaned['lot_number'],
            ).first()

            if lot_instance:
                for field, value in cleaned.items():
                    if field != 'subdivision':
                        setattr(lot_instance, field, value)
                lot_instance.save()
            else:
                lot_instance = Lot.objects.create(**cleaned)

            saved_lot_ids.append(lot_instance.id)
            normalized_lots.append({
                'id': lot_instance.id,
                'block': lot_instance.block,
                'lot': lot_instance.lot_number,
                'lot_number': lot_instance.lot_number,
                'area': lot_instance.area,
                'price': str(lot_instance.price),
                'status': lot_instance.status,
                'polygon_points': lot_instance.polygon_points,
                'points': lot_instance.polygon_points,
            })

        subdivision.blueprint_lots = normalized_lots
        subdivision.save(update_fields=['blueprint_lots'])

        Lot.objects.filter(subdivision=subdivision).exclude(id__in=saved_lot_ids).filter(
            reservation_requests__isnull=True,
            sales__isnull=True,
        ).delete()

    return saved_lot_ids


class SubdivisionListCreateView(APIView):
    permission_classes = []

    def get(self, request):
        if request.query_params.get('compact') == 'true':
            return Response(list(Subdivision.objects.values('id', 'name')))
        subdivisions = Subdivision.objects.prefetch_related('lots').all()
        return Response(SubdivisionSerializer(subdivisions, many=True).data)

    def post(self, request):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        name = request.data.get('name', '').strip()
        blueprint_data = request.data.get('blueprint_data', '')

        if not name:
            return Response({'detail': 'Subdivision name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not blueprint_data:
            return Response({'detail': 'Blueprint image is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(blueprint_data) > 4000000:
            return Response({'detail': 'Blueprint image is too large.'}, status=status.HTTP_400_BAD_REQUEST)

        detected_lots = detect_blueprint_lots_with_opencv(image_bytes)
        if not detected_lots and str(request.data.get('use_ai_fallback', '')).lower() in ['1', 'true', 'yes']:
            detected_lots = analyze_blueprint_with_ai(blueprint_data)
        subdivision, _ = Subdivision.objects.update_or_create(
            name=name,
            defaults={
                'blueprint_data': blueprint_data,
                'blueprint_lots': [],
            },
        )
        save_detected_lots(subdivision, detected_lots)

        subdivision = Subdivision.objects.prefetch_related('lots').get(pk=subdivision.pk)
        response_data = SubdivisionSerializer(subdivision).data
        if not detected_lots:
            response_data['detection_message'] = BLUEPRINT_DETECTION_ERROR

        return Response(response_data, status=status.HTTP_201_CREATED)


class SubdivisionDetailView(APIView):
    permission_classes = []

    def get(self, request, pk):
        try:
            subdivision = Subdivision.objects.prefetch_related('lots').get(pk=pk)
        except Subdivision.DoesNotExist:
            return Response({'detail': 'Subdivision not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(SubdivisionSerializer(subdivision).data)

    def put(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            subdivision = Subdivision.objects.get(pk=pk)
        except Subdivision.DoesNotExist:
            return Response({'detail': 'Subdivision not found.'}, status=status.HTTP_404_NOT_FOUND)

        name = request.data.get('name')
        blueprint_data = request.data.get('blueprint_data')

        if name is not None:
            subdivision.name = name.strip()
        if blueprint_data is not None:
            subdivision.blueprint_data = blueprint_data
            detected_lots = analyze_blueprint_with_ai(blueprint_data)
            save_detected_lots(subdivision, detected_lots)

        subdivision.save()
        subdivision = Subdivision.objects.prefetch_related('lots').get(pk=subdivision.pk)
        response_data = SubdivisionSerializer(subdivision).data
        if blueprint_data is not None and not detected_lots:
            response_data['detection_message'] = BLUEPRINT_DETECTION_ERROR
        return Response(response_data)

    def delete(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            subdivision = Subdivision.objects.get(pk=pk)
        except Subdivision.DoesNotExist:
            return Response({'detail': 'Subdivision not found.'}, status=status.HTTP_404_NOT_FOUND)

        subdivision.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def mapped_lot_points(item):
    points = item.get('polygon_points') or item.get('points') or []
    if points:
        return points

    try:
        x = float(item.get('x', 0))
        y = float(item.get('y', 0))
        width = float(item.get('width', 0))
        height = float(item.get('height', 0))
    except (TypeError, ValueError):
        return []

    if width <= 0 or height <= 0:
        return []

    return [
        {'x': x, 'y': y},
        {'x': x + width, 'y': y},
        {'x': x + width, 'y': y + height},
        {'x': x, 'y': y + height},
    ]


def clean_mapped_lot(item, subdivision, index):
    lot_number = item.get('lot_number', item.get('lot', index + 1))
    area = item.get('area') or 0
    price = item.get('price') or 0
    lot_status = item.get('status') or 'available'
    valid_statuses = {choice[0] for choice in Lot._meta.get_field('status').choices}

    try:
        lot_number = int(lot_number)
    except (TypeError, ValueError):
        lot_number = index + 1

    try:
        area = int(area)
    except (TypeError, ValueError):
        area = 0

    if lot_status not in valid_statuses:
        lot_status = 'available'

    points = mapped_lot_points(item)
    block = str(item.get('block') or 'Block A').strip() or 'Block A'

    return {
        'id': item.get('id'),
        'subdivision': subdivision,
        'block': block,
        'lot_number': lot_number,
        'area': area,
        'price': price,
        'status': lot_status,
        'polygon_points': points,
        **({'location_zone': item['location_zone']} if 'location_zone' in item else {}),
    }


class SubdivisionLotsUpdateView(APIView):
    permission_classes = []

    def put(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            subdivision = Subdivision.objects.get(pk=pk)
        except Subdivision.DoesNotExist:
            return Response({'detail': 'Subdivision not found.'}, status=status.HTTP_404_NOT_FOUND)

        lots = request.data.get('blueprint_lots', [])
        if not isinstance(lots, list):
            return Response({'detail': 'blueprint_lots must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_zones = {value for value, _ in LOCATION_ZONE_CHOICES}
        if any(isinstance(item, dict) and 'location_zone' in item
               and item['location_zone'] not in valid_zones for item in lots):
            return Response({'detail': 'Invalid location zone.'}, status=status.HTTP_400_BAD_REQUEST)

        saved_lot_ids = []
        normalized_lots = []

        with transaction.atomic():
            for index, item in enumerate(lots):
                if not isinstance(item, dict):
                    continue

                cleaned = clean_mapped_lot(item, subdivision, index)
                if len(cleaned['polygon_points']) < 3:
                    continue

                lot_id = cleaned.pop('id', None)
                lot_instance = None

                if isinstance(lot_id, int):
                    lot_instance = Lot.objects.filter(pk=lot_id, subdivision=subdivision).first()

                if not lot_instance:
                    lot_instance = Lot.objects.filter(
                        subdivision=subdivision,
                        block=cleaned['block'],
                        lot_number=cleaned['lot_number'],
                    ).first()

                if lot_instance:
                    for field, value in cleaned.items():
                        if field != 'subdivision':
                            setattr(lot_instance, field, value)
                    lot_instance.save()
                else:
                    lot_instance = Lot.objects.create(**cleaned)

                if 'location_zone' in cleaned:
                    matching_blueprint_lots_for_lot(lot_instance).update(location_zone=lot_instance.location_zone)
                saved_lot_ids.append(lot_instance.id)
                normalized_lots.append({
                    'id': lot_instance.id,
                    'block': lot_instance.block,
                    'lot': lot_instance.lot_number,
                    'lot_number': lot_instance.lot_number,
                    'area': lot_instance.area,
                    'price': str(lot_instance.price),
                    'status': lot_instance.status,
                    'location_zone': lot_instance.location_zone,
                    'polygon_points': lot_instance.polygon_points,
                    'points': lot_instance.polygon_points,
                })

            Lot.objects.filter(subdivision=subdivision).exclude(id__in=saved_lot_ids).filter(
                reservation_requests__isnull=True,
                sales__isnull=True,
            ).delete()

            subdivision.blueprint_lots = normalized_lots
            subdivision.save(update_fields=['blueprint_lots'])

        subdivision = Subdivision.objects.prefetch_related('lots').get(pk=pk)
        return Response(SubdivisionSerializer(subdivision).data)


class BlueprintListView(APIView):
    permission_classes = []

    def get(self, request):
        try:
            blueprints = Blueprint.objects.prefetch_related('lots').all()
            if role_name(request) != 'admin':
                blueprints = blueprints.filter(status='published')
            return Response([blueprint_response_data(blueprint) for blueprint in blueprints])
        except ProgrammingError as error:
            if 'blueprints' in str(error).lower() and 'does not exist' in str(error).lower():
                return Response([])
            raise


class BlueprintUploadView(APIView):
    permission_classes = []
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        title, mime_type, image_bytes, blueprint_data = extract_blueprint_upload(request)

        if not title:
            return Response({
                'detail': 'Blueprint title is required.',
                'field': 'title',
                'accepted_fields': ['title', 'name'],
            }, status=status.HTTP_400_BAD_REQUEST)

        if not image_bytes or not blueprint_data:
            return Response({
                'error': "No blueprint image uploaded. Use form-data field name 'image'.",
                'detail': 'Blueprint image is required.',
                'field': 'image',
                'accepted_fields': ['image'],
            }, status=status.HTTP_400_BAD_REQUEST)

        if len(image_bytes) > 6000000 or len(blueprint_data) > 8000000:
            return Response({'detail': 'Blueprint image is too large.'}, status=status.HTTP_400_BAD_REQUEST)

        if not blueprint_tables_exist():
            return Response({
                'detail': 'Database tables "blueprints" and "lots" do not exist yet. Run python manage.py migrate, then retry the upload.',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            image_url, storage_path = upload_blueprint_to_supabase(image_bytes, mime_type, title)
        except SupabaseStorageError as error:
            return Response({
                'error': error.error,
                'details': error.details,
                'detail': error.details or error.error,
            }, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as error:
            return Response({'error': str(error), 'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({
                'error': 'Unable to upload blueprint to Supabase Storage.',
                'detail': 'Unable to upload blueprint to Supabase Storage.',
            }, status=status.HTTP_502_BAD_GATEWAY)

        try:
            blueprint = Blueprint.objects.create(
                title=title,
                image_url=image_url,
                display_url=image_url,
                storage_path=storage_path,
                status='processing',
                processing_status='processing',
            )
        except ProgrammingError as error:
            if 'blueprints' in str(error).lower() and 'does not exist' in str(error).lower():
                return Response({
                    'detail': 'Database table "blueprints" does not exist. Run python manage.py migrate, then retry the upload.',
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            raise

        try:
            saved_lots = process_blueprint_detection(blueprint, image_bytes, blueprint_data)
        except ProgrammingError as error:
            if 'lots' in str(error).lower() and 'does not exist' in str(error).lower():
                blueprint.processing_status = 'failed'
                blueprint.save(update_fields=['processing_status'])
                return Response({
                    'detail': 'Database table "lots" does not exist. Run python manage.py migrate, then retry the upload.',
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            raise
        blueprint = Blueprint.objects.prefetch_related('lots').get(pk=blueprint.pk)
        response_data = blueprint_response_data(blueprint)
        if not saved_lots:
            response_data['detection_message'] = BLUEPRINT_DETECTION_ERROR
        return Response(response_data, status=status.HTTP_201_CREATED)


class BlueprintProcessView(APIView):
    permission_classes = []
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            blueprint = Blueprint.objects.get(pk=pk)
        except Blueprint.DoesNotExist:
            return Response({'detail': 'Blueprint not found.'}, status=status.HTTP_404_NOT_FOUND)

        title, mime_type, image_bytes, blueprint_data = extract_blueprint_upload(request)
        if not image_bytes:
            try:
                source_url = blueprint.display_url or blueprint.image_url
                with urlopen(source_url, timeout=20) as response:
                    image_bytes = response.read()
                    mime_type = response.headers.get_content_type() or mime_type
                blueprint_data = build_data_url(image_bytes, mime_type)
            except Exception:
                return Response({'detail': 'Unable to read blueprint image for processing.'}, status=status.HTTP_400_BAD_REQUEST)

        saved_lots = process_blueprint_detection(blueprint, image_bytes, blueprint_data)
        blueprint = Blueprint.objects.prefetch_related('lots').get(pk=blueprint.pk)
        response_data = blueprint_response_data(blueprint)
        if not saved_lots:
            response_data['detection_message'] = BLUEPRINT_DETECTION_ERROR
        return Response(response_data)


class BlueprintPublishView(APIView):
    permission_classes = []

    def post(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            blueprint = Blueprint.objects.prefetch_related('lots').get(pk=pk)
        except Blueprint.DoesNotExist:
            return Response({'detail': 'Blueprint not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not blueprint.lots.exists():
            return Response({'detail': 'Add at least one approved polygon before publishing.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            blueprint.status = 'published'
            blueprint.processing_status = 'completed'
            blueprint.save(update_fields=['status', 'processing_status'])
            sync_published_blueprint(blueprint)
        return Response(blueprint_response_data(blueprint))


class BlueprintDetailView(APIView):
    permission_classes = []

    def get(self, request, pk):
        try:
            blueprint = Blueprint.objects.prefetch_related('lots').get(pk=pk)
        except Blueprint.DoesNotExist:
            return Response({'detail': 'Blueprint not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(blueprint_response_data(blueprint))

    def delete(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            blueprint = Blueprint.objects.get(pk=pk)
        except Blueprint.DoesNotExist:
            return Response({'detail': 'Blueprint not found.'}, status=status.HTTP_404_NOT_FOUND)

        blueprint.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlueprintLotsListView(APIView):
    permission_classes = []

    def get(self, request, pk):
        try:
            blueprint = Blueprint.objects.get(pk=pk)
        except Blueprint.DoesNotExist:
            return Response({'detail': 'Blueprint not found.'}, status=status.HTTP_404_NOT_FOUND)

        lots = BlueprintLot.objects.filter(blueprint=blueprint)
        if blueprint.status != 'published' and role_name(request) != 'admin':
            return Response({'detail': 'Blueprint is not published yet.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(BlueprintLotSerializer(lots, many=True).data)

    @transaction.atomic
    def patch(self, request, pk):
        """Persist a correction session together; validation failures roll everything back."""
        from uuid import UUID
        import math
        from rest_framework.exceptions import ValidationError
        from .analytics_sync import lot_identity_number, has_ambiguous_identity

        permission_error = require_admin(request)
        if permission_error:
            return permission_error
        try:
            blueprint = Blueprint.objects.select_for_update().get(pk=pk)
        except Blueprint.DoesNotExist:
            return Response({'detail': 'Blueprint not found.'}, status=404)
        if not isinstance(request.data, dict):
            raise ValidationError('Corrections must be an object.')
        updates = request.data.get('updates', [])
        creates = request.data.get('creates', [])
        deletes = request.data.get('deletes', [])
        if not all(isinstance(group, list) for group in (updates, creates, deletes)):
            raise ValidationError('Corrections must contain lists of updates, creates and deletes.')
        existing = {str(lot.pk): lot for lot in blueprint.lots.select_for_update()}
        seen = set()
        def identity(value):
            try:
                key = str(UUID(str(value)))
            except (ValueError, TypeError, AttributeError):
                raise ValidationError('A valid lot ID is required.')
            if key in seen:
                raise ValidationError('A lot may only occur once in a correction batch.')
            seen.add(key)
            return key

        pending = []
        allowed = {'lot_number', 'block_number', 'category', 'model', 'description', 'location_zone',
                   'location_url', 'status', 'area_sqm', 'size', 'frontage', 'depth', 'price',
                   'coordinates', 'polygon_coordinates'}
        for items, creating in ((updates, False), (creates, True)):
            for item in items:
                if not isinstance(item, dict):
                    raise ValidationError('Each correction must be an object.')
                key = identity(item.get('id'))
                if (creating and BlueprintLot.objects.filter(pk=key).exists()) or (not creating and key not in existing):
                    raise ValidationError('Lot does not belong to this blueprint, or already exists.')
                unknown = set(item) - allowed - {'id'}
                if unknown:
                    raise ValidationError({'fields': sorted(unknown)})
                data = {field: value for field, value in item.items() if field in allowed}
                if creating or 'coordinates' in data or 'polygon_coordinates' in data:
                    points = data.get('coordinates', data.get('polygon_coordinates'))
                    if not isinstance(points, list) or len(points) < 3 or any(
                        not isinstance(point, list) or len(point) != 2 or any(
                            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1
                            for v in point) for point in points
                    ):
                        raise ValidationError('Polygons require at least three finite normalized coordinate pairs.')
                    data['coordinates'] = data['polygon_coordinates'] = points
                lot = None if creating else existing[key]
                serializer = BlueprintLotSerializer(lot, data=data, partial=not creating)
                serializer.is_valid(raise_exception=True)
                # Capture the old inventory identity before renumbering the map record.
                inventory = None
                if lot and blueprint.status == 'published' and not has_ambiguous_identity(lot):
                    inventory = Lot.objects.select_for_update().filter(
                        subdivision__name=blueprint.title, block=lot.block_number,
                        lot_number=lot_identity_number(lot.lot_number)).first()
                pending.append((key, serializer, inventory))
        removed = []
        for value in deletes:
            key = identity(value)
            if key not in existing:
                raise ValidationError('Deleted lot does not belong to this blueprint.')
            removed.append(existing[key])

        # Reject newly introduced complete identities while permitting edits to legacy duplicates.
        final_identities = {key: (lot.block_number, lot.lot_number) for key, lot in existing.items()
                            if lot not in removed}
        for key, serializer, inventory in pending:
            old = existing.get(key)
            block = serializer.validated_data.get('block_number', old.block_number if old else '')
            number = serializer.validated_data.get('lot_number', old.lot_number if old else '')
            final_identities[key] = (block, number)
        for key, serializer, inventory in pending:
            pair = final_identities[key]
            old = existing.get(key)
            if all(pair) and (not old or pair != (old.block_number, old.lot_number)):
                if any(other != key and identity_pair == pair for other, identity_pair in final_identities.items()):
                    raise ValidationError('Another polygon already uses this block and lot number.')

        saved = []
        for key, serializer, inventory in pending:
            lot = serializer.save(blueprint=blueprint, **({'id': key} if serializer.instance is None else {}))
            if inventory:
                number = lot_identity_number(lot.lot_number)
                if number is None or lot.status == 'open_space':
                    raise ValidationError('An inventory lot must retain a numeric lot identity and cannot become open space.')
                if Lot.objects.filter(subdivision=inventory.subdivision, block=lot.block_number, lot_number=number).exclude(pk=inventory.pk).exists():
                    raise ValidationError('Another inventory lot already uses this block and lot number.')
                inventory.block, inventory.lot_number = lot.block_number, number
                inventory.save(update_fields=['block', 'lot_number'])
            saved.append(lot)
        for lot in removed:
            if blueprint.status == 'published' and not has_ambiguous_identity(lot):
                inventory = Lot.objects.select_for_update().filter(
                    subdivision__name=blueprint.title, block=lot.block_number,
                    lot_number=lot_identity_number(lot.lot_number)).first()
                if inventory:
                    if inventory.sales.exists() or inventory.reservation_requests.exists():
                        raise ValidationError('Cannot delete a lot with reservations or sales history.')
                    inventory.delete()
            lot.delete()
        for lot in saved:
            inventory = sync_blueprint_lot(lot)
            if inventory and inventory.status != lot.status:
                lot.status = inventory.status
                lot.save(update_fields=['status'])
        return Response(BlueprintLotSerializer(blueprint.lots.all(), many=True).data)

    def post(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            blueprint = Blueprint.objects.get(pk=pk)
        except Blueprint.DoesNotExist:
            return Response({'detail': 'Blueprint not found.'}, status=status.HTTP_404_NOT_FOUND)

        coordinates = lot_points_to_coordinates(request.data)
        if len(coordinates) < 3:
            return Response({'detail': 'At least three polygon points are required.'}, status=status.HTTP_400_BAD_REQUEST)

        payload = request.data.copy()
        payload['blueprint'] = blueprint.id
        payload['coordinates'] = coordinates
        payload['polygon_coordinates'] = coordinates
        serializer = BlueprintLotSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        lot = serializer.save(blueprint=blueprint)
        if blueprint.status == 'published':
            blueprint.status = 'review'
            blueprint.save(update_fields=['status'])
        return Response(BlueprintLotSerializer(lot).data, status=status.HTTP_201_CREATED)


class BlueprintLotDetailView(APIView):
    permission_classes = []

    def patch(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            lot = BlueprintLot.objects.get(pk=pk)
        except BlueprintLot.DoesNotExist:
            return Response({'detail': 'Lot not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = {}
        field_map = {
            'block_number': 'block_number',
            'block': 'block_number',
            'size': 'size',
            'area': 'size',
            'area_sqm': 'area_sqm',
            'frontage': 'frontage',
            'depth': 'depth',
            'price': 'price',
            'status': 'status',
            'lot_number': 'lot_number',
            'description': 'description',
            'category': 'category',
            'model': 'model',
            'location_url': 'location_url',
            'location_zone': 'location_zone',
            'location': 'location_url',
            'area_sqm': 'area_sqm',
            'confidence_score': 'confidence_score',
            'is_ai_detected': 'is_ai_detected',
        }
        for source, target in field_map.items():
            if source in request.data:
                data[target] = request.data[source]

        if any(field in request.data for field in ['polygon_coordinates', 'coordinates', 'polygon_points', 'points']):
            coordinates = lot_points_to_coordinates(request.data)
            if len(coordinates) < 3:
                return Response({'detail': 'At least three polygon points are required.'}, status=status.HTTP_400_BAD_REQUEST)
            data['coordinates'] = coordinates
            data['polygon_coordinates'] = coordinates

        serializer = BlueprintLotSerializer(lot, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
            sync_blueprint_lot(lot)
        return Response(BlueprintLotSerializer(lot).data)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        permission_error = require_admin(request)
        if permission_error:
            return permission_error

        try:
            lot = BlueprintLot.objects.get(pk=pk)
        except BlueprintLot.DoesNotExist:
            return Response({'detail': 'Lot not found.'}, status=status.HTTP_404_NOT_FOUND)

        lot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        return auth_response(user)



