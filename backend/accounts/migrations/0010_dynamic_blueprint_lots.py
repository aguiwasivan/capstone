from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_systemparameter_saletransaction'),
    ]

    operations = [
        migrations.AddField(
            model_name='lot',
            name='subdivision',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='lots', to='accounts.subdivision'),
        ),
        migrations.AddField(
            model_name='lot',
            name='price',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='lot',
            name='polygon_points',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name='lot',
            name='status',
            field=models.CharField(choices=[('available', 'Available'), ('pending', 'Pending'), ('reserved', 'Reserved'), ('sold', 'Sold'), ('unavailable', 'Unavailable'), ('occupied', 'Occupied')], default='available', max_length=20),
        ),
        migrations.AlterUniqueTogether(
            name='lot',
            unique_together={('subdivision', 'block', 'lot_number')},
        ),
    ]
