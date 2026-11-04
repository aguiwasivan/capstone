from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction

from rest_framework import serializers

from accounts.models import ReservationRequest, SaleTransaction


def calculate_commission(total_contract_price, percentage):
    if percentage in [None, '']:
        return None

    return (
        Decimal(total_contract_price) *
        Decimal(percentage) /
        Decimal('100')
    ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class SaleTransactionSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source='agent.get_full_name', read_only=True)
    manager_name = serializers.CharField(source='manager.get_full_name', read_only=True)
    broker_name = serializers.CharField(source='broker.get_full_name', read_only=True)
    client_name = serializers.CharField(source='client.get_full_name', read_only=True)
    lot_label = serializers.SerializerMethodField()
    subdivision_name = serializers.SerializerMethodField()
    block_number = serializers.SerializerMethodField()
    lot_number = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    remaining_balance = serializers.SerializerMethodField()
    agent_commission_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal('0'),
        max_value=Decimal('100'),
        required=False,
        write_only=True,
    )
    manager_commission_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal('0'),
        max_value=Decimal('100'),
        required=False,
        write_only=True,
    )
    broker_commission_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal('0'),
        max_value=Decimal('100'),
        required=False,
        write_only=True,
    )

    class Meta:
        model = SaleTransaction
        fields = [
            'id',
            'reservation',
            'agent',
            'agent_name',
            'manager',
            'manager_name',
            'broker',
            'broker_name',
            'client',
            'client_name',
            'lot',
            'lot_label',
            'subdivision_name',
            'block_number',
            'lot_number',
            'developer',
            'project',
            'sale_date',
            'total_contract_price',
            'payment_status',
            'remaining_balance',
            'agent_commission',
            'agent_commission_percent',
            'manager_commission',
            'manager_commission_percent',
            'broker_commission',
            'broker_commission_percent',
            'notes',
            'created_by',
            'created_at',
        ]
        read_only_fields = ['created_by', 'created_at']

    def get_lot_label(self, sale):
        if not sale.lot:
            return ''
        return f'{sale.lot.block}, Lot {sale.lot.lot_number}'

    def get_subdivision_name(self, sale):
        if not sale.lot or not sale.lot.subdivision:
            return ''
        return sale.lot.subdivision.name

    def get_block_number(self, sale):
        return sale.lot.block if sale.lot else ''

    def get_lot_number(self, sale):
        return sale.lot.lot_number if sale.lot else ''

    def get_payment_status(self, sale):
        return 'Not recorded'

    def get_remaining_balance(self, sale):
        return None

    def validate_agent(self, value):
        if value and value.role != 'agent':
            raise serializers.ValidationError('Selected user must be an agent.')
        return value

    def validate_manager(self, value):
        if value and value.role != 'manager':
            raise serializers.ValidationError('Selected user must be a manager.')
        return value

    def validate_broker(self, value):
        if value and value.role != 'broker':
            raise serializers.ValidationError('Selected user must be a broker.')
        return value

    def validate_client(self, value):
        if value and value.role != 'client':
            raise serializers.ValidationError('Selected user must be a client.')
        return value

    def apply_commission_percentages(self, validated_data, instance=None):
        total_contract_price = validated_data.get(
            'total_contract_price',
            instance.total_contract_price if instance else None,
        )

        percentage_fields = {
            'agent_commission_percent': 'agent_commission',
            'manager_commission_percent': 'manager_commission',
            'broker_commission_percent': 'broker_commission',
        }

        for percent_field, amount_field in percentage_fields.items():
            percentage = validated_data.pop(percent_field, None)
            commission = calculate_commission(total_contract_price, percentage)
            if commission is not None:
                validated_data[amount_field] = commission

        return validated_data

    def apply_reservation_link(self, validated_data, instance=None):
        if validated_data.get('reservation') or instance:
            return validated_data

        lot = validated_data.get('lot')
        client = validated_data.get('client')
        if not lot or not client:
            return validated_data

        reservation = (
            ReservationRequest.objects
            .filter(lot=lot, client=client, status='approved')
            .order_by('-reviewed_at', '-created_at')
            .first()
        )
        if reservation:
            validated_data['reservation'] = reservation

        return validated_data

    def apply_reservation_details(self, validated_data):
        reservation = validated_data.get('reservation')
        if not reservation:
            return validated_data

        validated_data.setdefault('lot', reservation.lot)
        validated_data.setdefault('client', reservation.client)
        return validated_data

    @transaction.atomic
    def create(self, validated_data):
        validated_data = self.apply_reservation_details(validated_data)
        validated_data = self.apply_commission_percentages(validated_data)
        validated_data = self.apply_reservation_link(validated_data)
        reservation = validated_data.get('reservation')
        if reservation and reservation.assigned_agent_id:
            if validated_data.get('agent') and validated_data['agent'].pk != reservation.assigned_agent_id:
                raise serializers.ValidationError({'agent': 'Use the assigned reservation agent or reassign the reservation first.'})
            validated_data['agent'] = reservation.assigned_agent
        sale = super().create(validated_data)
        if reservation and not reservation.assigned_agent_id and sale.agent_id:
            reservation.assigned_agent = sale.agent
            reservation.save(update_fields=['assigned_agent'])
        return sale

    def update(self, instance, validated_data):
        validated_data = self.apply_reservation_details(validated_data)
        validated_data = self.apply_commission_percentages(validated_data, instance)
        reservation = validated_data.get('reservation', instance.reservation)
        agent = validated_data.get('agent', instance.agent)
        if reservation and reservation.assigned_agent_id and (not agent or agent.pk != reservation.assigned_agent_id):
            raise serializers.ValidationError({'agent': 'The sale agent must match the reservation assignment.'})
        return super().update(instance, validated_data)
