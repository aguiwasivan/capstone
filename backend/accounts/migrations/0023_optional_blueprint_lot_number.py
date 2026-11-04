from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('accounts', '0022_analyticspredictionmodel_and_more')]
    operations = [
        migrations.AlterField(
            model_name='blueprintlot', name='lot_number',
            field=models.TextField(blank=True, default=''),
        ),
    ]
