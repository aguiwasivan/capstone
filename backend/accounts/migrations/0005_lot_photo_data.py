from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_alter_lot_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='lot',
            name='photo_data',
            field=models.TextField(blank=True, default=''),
        ),
    ]
