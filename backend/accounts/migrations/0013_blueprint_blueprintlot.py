import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_alter_lot_options'),
    ]

    operations = [
        migrations.CreateModel(
            name='Blueprint',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.TextField(blank=True, default='')),
                ('image_url', models.TextField(blank=True, default='')),
                ('storage_path', models.TextField(blank=True, default='')),
                ('processing_status', models.CharField(choices=[('pending', 'Pending'), ('processing', 'Processing'), ('completed', 'Completed'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'blueprints',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='BlueprintLot',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('lot_number', models.TextField()),
                ('block_number', models.TextField(blank=True, default='')),
                ('size', models.TextField(blank=True, null=True)),
                ('price', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('status', models.CharField(choices=[('available', 'Available'), ('reserved', 'Reserved'), ('sold', 'Sold'), ('unavailable', 'Unavailable')], default='available', max_length=20)),
                ('coordinates', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('blueprint', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lots', to='accounts.blueprint')),
            ],
            options={
                'db_table': 'lots',
                'ordering': ['created_at'],
            },
        ),
    ]
