from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
import uuid

class User(AbstractUser):
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('broker', 'Broker'),
        ('agent', 'Agent'),
        ('client', 'Client'),
    )
    BUYER_TYPE_CHOICES = (
        ('individual', 'Individual Buyer'),
        ('couple', 'Couple / Family'),
        ('investor', 'Investor'),
        ('company', 'Company'),
    )
    CONTACT_METHOD_CHOICES = (
        ('email', 'Email'),
        ('phone', 'Phone'),
        ('sms', 'SMS'),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='client')
    phone_number = models.CharField(max_length=30, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True)
    province = models.CharField(max_length=120, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    buyer_type = models.CharField(max_length=20, choices=BUYER_TYPE_CHOICES, default='individual')
    preferred_contact_method = models.CharField(
        max_length=20,
        choices=CONTACT_METHOD_CHOICES,
        default='email',
    )
    payment_card_number = models.CharField(max_length=19, blank=True)
    payment_card_name = models.CharField(max_length=150, blank=True)
    payment_card_expiry_month = models.PositiveSmallIntegerField(null=True, blank=True)
    payment_card_expiry_year = models.PositiveSmallIntegerField(null=True, blank=True)

    @property
    def payment_card_last4(self):
        if not self.payment_card_number:
            return ''
        return self.payment_card_number[-4:]


LOCATION_ZONE_CHOICES = (
    ('front', 'Front Area'),
    ('central', 'Central Area'),
    ('rear', 'Rear Area'),
    ('unassigned', 'Unassigned'),
)


class Lot(models.Model):
    subdivision = models.ForeignKey(
        'Subdivision',
        on_delete=models.CASCADE,
        related_name='lots',
        null=True,
        blank=True,
    )
    block = models.CharField(max_length=50)
    lot_number = models.PositiveIntegerField()
    area = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20,
        choices=(
            ('available', 'Available'),
            ('pending', 'Pending'),
            ('reserved', 'Reserved'),
            ('sold', 'Sold'),
            ('unavailable', 'Unavailable'),
            ('occupied', 'Occupied'),
        ),
        default='available',
    )
    polygon_points = models.JSONField(default=list, blank=True)
    photo_data = models.TextField(blank=True, default='')
    location_url = models.TextField(blank=True, default='')
    location_zone = models.CharField(max_length=10, choices=LOCATION_ZONE_CHOICES, default='unassigned')

    class Meta:
        unique_together = ('subdivision', 'block', 'lot_number')
        ordering = ['subdivision__name', 'block', 'lot_number']

    def __str__(self):
        return f'{self.block}, Lot {self.lot_number}'


class Subdivision(models.Model):
    name = models.CharField(max_length=120, unique=True)
    blueprint_data = models.TextField(blank=True, default='')
    blueprint_lots = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Blueprint(models.Model):
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('processing', 'Processing'),
        ('review', 'Review'),
        ('published', 'Published'),
        ('failed', 'Failed'),
    )
    PROCESSING_STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField(blank=True, default='')
    image_url = models.TextField(blank=True, default='')
    display_url = models.TextField(blank=True, default='')
    storage_path = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    processing_status = models.CharField(
        max_length=20,
        choices=PROCESSING_STATUS_CHOICES,
        default='pending',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'blueprints'
        ordering = ['-created_at']

    def __str__(self):
        return self.title or str(self.id)


class BlueprintLot(models.Model):
    STATUS_CHOICES = (
        ('available', 'Available'),
        ('pending', 'Pending'),
        ('reserved', 'Reserved'),
        ('sold', 'Sold'),
        ('open_space', 'Open Space'),
        ('unavailable', 'Unavailable'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    blueprint = models.ForeignKey(
        Blueprint,
        on_delete=models.CASCADE,
        related_name='lots',
    )
    lot_number = models.TextField(blank=True, default='')
    block_number = models.TextField(blank=True, default='')
    area_sqm = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    size = models.TextField(null=True, blank=True)
    frontage = models.TextField(null=True, blank=True)
    depth = models.TextField(null=True, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    description = models.TextField(blank=True, default='')
    category = models.CharField(max_length=120, blank=True, default='')
    model = models.CharField(max_length=120, blank=True, default='')
    polygon_coordinates = models.JSONField(default=list, blank=True)
    coordinates = models.JSONField(default=list, blank=True)
    location_url = models.TextField(blank=True, default='')
    location_zone = models.CharField(max_length=10, choices=LOCATION_ZONE_CHOICES, default='unassigned')
    confidence_score = models.FloatField(default=0)
    is_ai_detected = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lots'
        ordering = ['created_at']

    def __str__(self):
        return self.lot_number


class ReservationRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
        ('rejected', 'Rejected'),
    )

    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='reservation_requests')
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reservation_requests')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    assigned_agent = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_reservations', limit_choices_to={'role': 'agent'},
    )
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_reservation_requests',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.client.username} - {self.lot} ({self.status})'


class LotDemandObservation(models.Model):
    """Features recorded while a lot is available; outcomes mature after 30 days."""
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='demand_observations')
    observed_at = models.DateTimeField(default=timezone.now)
    observed_date = models.DateField()
    features = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['lot', 'observed_date'], name='unique_lot_demand_day')]


class AnalyticsPredictionModel(models.Model):
    key = models.CharField(max_length=50, unique=True)
    parameters = models.JSONField(default=dict)
    trained_at = models.DateTimeField(auto_now=True)


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    reservation_request = models.ForeignKey(
        ReservationRequest,
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class SystemParameter(models.Model):
    key = models.SlugField(max_length=80, unique=True)
    label = models.CharField(max_length=120)
    value = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return self.label


class SaleTransaction(models.Model):
    reservation = models.ForeignKey(
        ReservationRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
    )
    agent = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='agent_sales',
    )
    manager = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manager_sales',
    )
    broker = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='broker_sales',
    )
    client = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='client_sales',
    )
    lot = models.ForeignKey(
        Lot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
    )
    developer = models.CharField(max_length=120, blank=True)
    project = models.CharField(max_length=120)
    sale_date = models.DateField()
    total_contract_price = models.DecimalField(max_digits=12, decimal_places=2)
    agent_commission = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    manager_commission = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    broker_commission = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_sales',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sale_date', '-created_at']

    def __str__(self):
        return f'{self.project} - {self.total_contract_price}'

