from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0018_reservation_statuses_sale_reservation'),
    ]

    operations = [
        migrations.AlterField(
            model_name='blueprintlot',
            name='status',
            field=models.CharField(
                choices=[
                    ('available', 'Available'),
                    ('pending', 'Pending'),
                    ('reserved', 'Reserved'),
                    ('sold', 'Sold'),
                    ('open_space', 'Open Space'),
                    ('unavailable', 'Unavailable'),
                ],
                default='available',
                max_length=20,
            ),
        ),
    ]
