from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_lot_reservationrequest_notification'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lot',
            name='status',
            field=models.CharField(
                choices=[
                    ('available', 'Available'),
                    ('pending', 'Pending'),
                    ('reserved', 'Reserved'),
                    ('occupied', 'Occupied'),
                ],
                default='available',
                max_length=20,
            ),
        ),
    ]
