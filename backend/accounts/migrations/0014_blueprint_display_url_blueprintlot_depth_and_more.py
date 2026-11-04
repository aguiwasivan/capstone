from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_blueprint_blueprintlot'),
    ]

    operations = [
        migrations.AddField(
            model_name='blueprint',
            name='display_url',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='depth',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='frontage',
            field=models.TextField(blank=True, null=True),
        ),
    ]
