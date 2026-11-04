from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0016_alter_blueprintlot_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='blueprint',
            name='status',
            field=models.CharField(choices=[('draft', 'Draft'), ('processing', 'Processing'), ('review', 'Review'), ('published', 'Published'), ('failed', 'Failed')], default='draft', max_length=20),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='area_sqm',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='category',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='model',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='polygon_coordinates',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='confidence_score',
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name='blueprintlot',
            name='is_ai_detected',
            field=models.BooleanField(default=False),
        ),
    ]
