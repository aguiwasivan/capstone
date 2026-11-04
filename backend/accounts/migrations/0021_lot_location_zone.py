from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('accounts', '0020_lot_location_url_blueprintlot_location_url')]

    operations = [
        migrations.AddField(
            model_name=model_name,
            name='location_zone',
            field=models.CharField(
                max_length=10,
                choices=[('front', 'Front Area'), ('central', 'Central Area'),
                         ('rear', 'Rear Area'), ('unassigned', 'Unassigned')],
                default='unassigned',
            ),
        )
        for model_name in ('lot', 'blueprintlot')
    ]
