from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('accounts', '0023_optional_blueprint_lot_number')]
    operations = [migrations.AddField(model_name='blueprintlot', name='description', field=models.TextField(blank=True, default=''))]
