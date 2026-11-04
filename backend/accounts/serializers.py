from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.utils.crypto import get_random_string
from django.utils import timezone
from rest_framework import serializers
from .models import (
    Blueprint,
    BlueprintLot,
    Lot,
    Notification,
    ReservationRequest,
    Subdivision,
    SystemParameter,
    User,
)


def digits_only(value):
    return ''.join(character for character in value if character.isdigit())


def passes_luhn_check(card_number):
    total = 0
    reverse_digits = card_number[::-1]
    for index, digit in enumerate(reverse_digits):
        number = int(digit)
        if index % 2 == 1:
            number *= 2
            if number > 9:
                number -= 9
        total += number
    return total % 10 == 0

class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.CharField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES, required=False, default='client')
    payment_card_number = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )
    payment_card_last4 = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            'username',
            'password',
            'first_name',
            'last_name',
            'email',
            'role',
            'phone_number',
            'date_of_birth',
            'address_line1',
            'address_line2',
            'city',
            'province',
            'postal_code',
            'buyer_type',
            'preferred_contact_method',
            'payment_card_number',
            'payment_card_name',
            'payment_card_expiry_month',
            'payment_card_expiry_year',
            'payment_card_last4',
        ]
        extra_kwargs = {
            'password': {'write_only': True},
            'first_name': {'required': True, 'allow_blank': False},
            'last_name': {'required': True, 'allow_blank': False},
            'email': {'required': True, 'allow_blank': False},
        }

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return email

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_role(self, value):
        if value != 'client':
            raise serializers.ValidationError('Public registration is only available for clients.')
        return value

    def validate_payment_card_number(self, value):
        if not value:
            return ''

        card_number = digits_only(value)
        if not 13 <= len(card_number) <= 19:
            raise serializers.ValidationError('Card number must contain 13 to 19 digits.')

        if not passes_luhn_check(card_number):
            raise serializers.ValidationError('Card number is invalid.')

        return card_number

    def validate_payment_card_expiry_month(self, value):
        if value is not None and not 1 <= value <= 12:
            raise serializers.ValidationError('Expiry month must be between 1 and 12.')
        return value

    def validate_payment_card_expiry_year(self, value):
        current_year = timezone.now().year
        if value is not None and value < current_year:
            raise serializers.ValidationError(f'Expiry year must be {current_year} or later.')
        return value

    def validate(self, data):
        card_number = data.get('payment_card_number')
        expiry_month = data.get('payment_card_expiry_month')
        expiry_year = data.get('payment_card_expiry_year')
        has_card_details = any(field not in [None, ''] for field in [
            card_number,
            expiry_month,
            expiry_year,
        ])

        if not has_card_details:
            data['payment_card_number'] = ''
            data['payment_card_name'] = ''
            data['payment_card_expiry_month'] = None
            data['payment_card_expiry_year'] = None
            return data

        card_fields = [
            card_number,
            data.get('payment_card_name'),
            expiry_month,
            expiry_year,
        ]
        has_all_card_fields = all(field not in [None, ''] for field in card_fields)

        if not has_all_card_fields:
            raise serializers.ValidationError({
                'payment': 'Card number, cardholder name, expiry month, and expiry year are required together.'
            })

        today = timezone.now().date()
        if expiry_year == today.year and expiry_month is not None and expiry_month < today.month:
            raise serializers.ValidationError({
                'payment_card_expiry_month': 'Card expiry month cannot be in the past.'
            })

        return data

    def create(self, validated_data):
        if not validated_data.get('username'):
            validated_data['username'] = self.build_username(validated_data['email'])

        user = User.objects.create_user(**validated_data)
        return user

    def build_username(self, email):
        base_username = email.split('@')[0][:140] or 'client'
        username = base_username
        counter = 1

        while User.objects.filter(username=username).exists():
            suffix = str(counter)
            username = f'{base_username[:150 - len(suffix)]}{suffix}'
            counter += 1

        return username


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

    def validate(self, data):
        username_or_email = data.get('username', '').strip()
        password = data.get('password')
        username = username_or_email

        if '@' in username_or_email:
            user_by_email = User.objects.filter(email__iexact=username_or_email).first()
            if user_by_email:
                username = user_by_email.username

        user = authenticate(username=username, password=password)
        if user and user.is_active:
            return user
        raise serializers.ValidationError("Invalid credentials")


class UserProfileSerializer(serializers.ModelSerializer):
    payment_card_number = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )
    payment_card_last4 = serializers.CharField(read_only=True)
    role_label = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'role',
            'role_label',
            'is_active',
            'date_joined',
            'last_login',
            'phone_number',
            'date_of_birth',
            'address_line1',
            'address_line2',
            'city',
            'province',
            'postal_code',
            'buyer_type',
            'preferred_contact_method',
            'payment_card_number',
            'payment_card_name',
            'payment_card_expiry_month',
            'payment_card_expiry_year',
            'payment_card_last4',
        ]
        read_only_fields = [
            'id',
            'username',
            'role',
            'role_label',
            'is_active',
            'date_joined',
            'last_login',
            'payment_card_last4',
        ]
        extra_kwargs = {
            'first_name': {'required': True, 'allow_blank': False},
            'last_name': {'required': True, 'allow_blank': False},
            'email': {'required': True, 'allow_blank': False},
        }

    def validate_email(self, value):
        email = value.strip().lower()
        queryset = User.objects.filter(email__iexact=email)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError('A user with this email already exists.')

        return email

    def validate_payment_card_number(self, value):
        if not value:
            return ''

        card_number = digits_only(value)
        if not 13 <= len(card_number) <= 19:
            raise serializers.ValidationError('Card number must contain 13 to 19 digits.')

        if not passes_luhn_check(card_number):
            raise serializers.ValidationError('Card number is invalid.')

        return card_number

    def validate_payment_card_expiry_month(self, value):
        if value is not None and not 1 <= value <= 12:
            raise serializers.ValidationError('Expiry month must be between 1 and 12.')
        return value

    def validate_payment_card_expiry_year(self, value):
        current_year = timezone.now().year
        if value is not None and value < current_year:
            raise serializers.ValidationError(f'Expiry year must be {current_year} or later.')
        return value

    def validate(self, data):
        expiry_month = data.get(
            'payment_card_expiry_month',
            self.instance.payment_card_expiry_month if self.instance else None,
        )
        expiry_year = data.get(
            'payment_card_expiry_year',
            self.instance.payment_card_expiry_year if self.instance else None,
        )
        today = timezone.now().date()

        if expiry_year == today.year and expiry_month is not None and expiry_month < today.month:
            raise serializers.ValidationError({
                'payment_card_expiry_month': 'Card expiry month cannot be in the past.'
            })

        return data


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context.get('user')
        if not user or not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context.get('user'))
        return value

    def validate(self, data):
        if data.get('new_password') != data.get('confirm_password'):
            raise serializers.ValidationError({
                'confirm_password': 'New password and confirmation do not match.'
            })
        return data


class UserManagementSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'password',
            'first_name',
            'last_name',
            'email',
            'role',
            'phone_number',
            'is_active',
            'date_joined',
        ]
        read_only_fields = ['id', 'date_joined']
        extra_kwargs = {
            'username': {'required': False},
            'email': {'required': True, 'allow_blank': False},
        }

    def validate_email(self, value):
        email = value.strip().lower()
        queryset = User.objects.filter(email__iexact=email)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError('A user with this email already exists.')

        return email

    def create(self, validated_data):
        password = validated_data.pop('password', None) or get_random_string(12)
        if not validated_data.get('username'):
            validated_data['username'] = self.build_username(validated_data['email'])

        user = User.objects.create_user(password=password, **validated_data)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)

        if password:
            instance.set_password(password)

        instance.save()
        return instance

    def build_username(self, email):
        base_username = email.split('@')[0][:140] or 'user'
        username = base_username
        counter = 1

        while User.objects.filter(username=username).exists():
            suffix = str(counter)
            username = f'{base_username[:150 - len(suffix)]}{suffix}'
            counter += 1

        return username


class SystemParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemParameter
        fields = ['id', 'key', 'label', 'value', 'description', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class OptionalLotTextField(serializers.CharField):
    """Accept null as an explicit clear while retaining NOT NULL database columns."""

    def run_validation(self, data=serializers.empty):
        return super().run_validation('' if data is None else data)


class BlueprintLotSerializer(serializers.ModelSerializer):
    lot_number = OptionalLotTextField(required=False, allow_blank=True, default='')
    block_number = OptionalLotTextField(required=False, allow_blank=True)
    category = OptionalLotTextField(required=False, allow_blank=True, max_length=120)
    model = OptionalLotTextField(required=False, allow_blank=True, max_length=120)
    location_url = OptionalLotTextField(required=False, allow_blank=True)
    block = OptionalLotTextField(source='block_number', required=False, allow_blank=True)
    area = serializers.CharField(source='size', required=False, allow_blank=True, allow_null=True)
    polygon_coordinates = serializers.JSONField(required=False)
    category_model = serializers.SerializerMethodField()
    polygon_points = serializers.SerializerMethodField()
    points = serializers.SerializerMethodField()
    lot = serializers.SerializerMethodField()

    class Meta:
        model = BlueprintLot
        fields = [
            'id',
            'blueprint',
            'lot_number',
            'lot',
            'block_number',
            'block',
            'area_sqm',
            'size',
            'area',
            'frontage',
            'depth',
            'price',
            'status',
            'description',
            'category',
            'model',
            'category_model',
            'coordinates',
            'polygon_coordinates',
            'location_url',
            'location_zone',
            'confidence_score',
            'is_ai_detected',
            'polygon_points',
            'points',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'blueprint', 'created_at', 'updated_at']

    def get_polygon_points(self, lot):
        coordinates = lot.polygon_coordinates or lot.coordinates or []
        return [
            {'x': point[0] * 100 if point[0] <= 1 else point[0], 'y': point[1] * 100 if point[1] <= 1 else point[1]}
            for point in coordinates
            if isinstance(point, list) and len(point) >= 2
        ]

    def get_points(self, lot):
        return self.get_polygon_points(lot)

    def get_category_model(self, lot):
        return lot.category or lot.model or ''

    def validate(self, attrs):
        coordinates = attrs.get('polygon_coordinates') or attrs.get('coordinates')
        if coordinates:
            attrs['polygon_coordinates'] = coordinates
            attrs['coordinates'] = coordinates
        return attrs

    def get_lot(self, lot):
        digits = ''.join(character for character in str(lot.lot_number) if character.isdigit())
        return int(digits) if digits else lot.lot_number


class BlueprintSerializer(serializers.ModelSerializer):
    lots = BlueprintLotSerializer(many=True, read_only=True)
    name = serializers.CharField(source='title', read_only=True)
    blueprint_data = serializers.CharField(source='image_url', read_only=True)
    blueprint_lots = serializers.SerializerMethodField()

    class Meta:
        model = Blueprint
        fields = [
            'id',
            'title',
            'name',
            'image_url',
            'display_url',
            'blueprint_data',
            'storage_path',
            'status',
            'processing_status',
            'lots',
            'blueprint_lots',
            'created_at',
        ]
        read_only_fields = ['id', 'storage_path', 'processing_status', 'lots', 'blueprint_lots', 'created_at']

    def get_blueprint_lots(self, blueprint):
        return BlueprintLotSerializer(blueprint.lots.all(), many=True).data


class LotSerializer(serializers.ModelSerializer):
    reserved_client_name = serializers.SerializerMethodField()
    reserved_client_email = serializers.SerializerMethodField()
    reserved_reviewed_by_name = serializers.SerializerMethodField()
    subdivision_name = serializers.CharField(source='subdivision.name', read_only=True)

    class Meta:
        model = Lot
        fields = [
            'id',
            'subdivision',
            'subdivision_name',
            'block',
            'lot_number',
            'area',
            'price',
            'status',
            'polygon_points',
            'photo_data',
            'location_url',
            'location_zone',
            'reserved_client_name',
            'reserved_client_email',
            'reserved_reviewed_by_name',
        ]

    def get_approved_reservation(self, lot):
        approved_reservations = getattr(lot, 'approved_reservations', None)
        if approved_reservations is not None:
            return approved_reservations[0] if approved_reservations else None

        return (
            lot.reservation_requests
            .select_related('client', 'reviewed_by')
            .filter(status='approved')
            .order_by('-reviewed_at', '-created_at')
            .first()
        )

    def get_reserved_client_name(self, lot):
        reservation = self.get_approved_reservation(lot)
        if not reservation:
            return ''

        full_name = reservation.client.get_full_name().strip()
        return full_name or reservation.client.username

    def get_reserved_client_email(self, lot):
        reservation = self.get_approved_reservation(lot)
        return reservation.client.email if reservation else ''

    def get_reserved_reviewed_by_name(self, lot):
        reservation = self.get_approved_reservation(lot)
        if not reservation or not reservation.reviewed_by:
            return ''

        full_name = reservation.reviewed_by.get_full_name().strip()
        return full_name or reservation.reviewed_by.username

class SubdivisionSerializer(serializers.ModelSerializer):
    lots = LotSerializer(many=True, read_only=True)

    class Meta:
        model = Subdivision
        fields = ['id', 'name', 'blueprint_data', 'blueprint_lots', 'lots', 'created_at']


class ReservationRequestSerializer(serializers.ModelSerializer):
    assigned_agent_name = serializers.CharField(source='assigned_agent.username', read_only=True)
    lot = LotSerializer(read_only=True)
    lot_id = serializers.PrimaryKeyRelatedField(
        queryset=Lot.objects.all(),
        source='lot',
        write_only=True,
    )
    client_username = serializers.CharField(source='client.username', read_only=True)
    client_email = serializers.EmailField(source='client.email', read_only=True)
    client_phone_number = serializers.CharField(source='client.phone_number', read_only=True)
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True)

    class Meta:
        model = ReservationRequest
        fields = [
            'id',
            'lot',
            'lot_id',
            'client',
            'client_username',
            'client_email',
            'client_phone_number',
            'status',
            'assigned_agent',
            'assigned_agent_name',
            'reviewed_by',
            'reviewed_by_username',
            'created_at',
            'reviewed_at',
        ]
        read_only_fields = [
            'assigned_agent',
            'client',
            'status',
            'reviewed_by',
            'created_at',
            'reviewed_at',
        ]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id',
            'reservation_request',
            'title',
            'message',
            'is_read',
            'created_at',
        ]

