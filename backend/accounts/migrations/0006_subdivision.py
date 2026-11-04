from django.db import migrations, models


def seed_subdivisions(apps, schema_editor):
    Subdivision = apps.get_model('accounts', 'Subdivision')
    names = [
        'Calmar Subdivision',
        'Greenfield Estates',
        'Southridge Heights',
        'Maple Grove Village',
        'Riverbend Residences',
    ]

    for name in names:
        Subdivision.objects.get_or_create(name=name)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_lot_photo_data'),
    ]

    operations = [
        migrations.CreateModel(
            name='Subdivision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('blueprint_data', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.RunPython(seed_subdivisions, migrations.RunPython.noop),
    ]
