from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_subdivision'),
    ]

    operations = [
        migrations.AddField(
            model_name='subdivision',
            name='blueprint_lots',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
