from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_lots(apps, schema_editor):
    Lot = apps.get_model('accounts', 'Lot')
    lots = []

    for number in range(1, 14):
        lots.append(('Block A', number, 320))
    for number in range(27, 34):
        lots.append(('Block B', number, 400 if number == 27 else 329))
    for number in range(26, 35):
        lots.append(('Block C', number, 329))
    for number in range(14, 20):
        lots.append(('Block D', number, 353 if number == 19 else 320))
    for number in range(32, 38):
        lots.append(('Block E', number, 201))
    for number in range(38, 43):
        lots.append(('Block F', number, 329))
    for number in range(45, 52):
        lots.append(('Block G', number, 201))

    for block, lot_number, area in lots:
        Lot.objects.get_or_create(
            block=block,
            lot_number=lot_number,
            defaults={'area': area, 'status': 'available'},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_alter_user_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='Lot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('block', models.CharField(max_length=50)),
                ('lot_number', models.PositiveIntegerField()),
                ('area', models.PositiveIntegerField()),
                ('status', models.CharField(choices=[('available', 'Available'), ('pending', 'Pending'), ('reserved', 'Reserved')], default='available', max_length=20)),
            ],
            options={
                'ordering': ['block', 'lot_number'],
                'unique_together': {('block', 'lot_number')},
            },
        ),
        migrations.CreateModel(
            name='ReservationRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reservation_requests', to=settings.AUTH_USER_MODEL)),
                ('lot', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reservation_requests', to='accounts.lot')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_reservation_requests', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=150)),
                ('message', models.TextField()),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reservation_request', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='accounts.reservationrequest')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.RunPython(seed_lots, migrations.RunPython.noop),
    ]
