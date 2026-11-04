from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0019_alter_blueprintlot_status_pending'),
    ]

    operations = [
        migrations.AddField(
            model_name='blueprintlot',
            name='location_url',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='lot',
            name='location_url',
            field=models.TextField(blank=True, default=''),
        ),
    ]
