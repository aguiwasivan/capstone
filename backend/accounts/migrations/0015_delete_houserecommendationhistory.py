from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0014_blueprint_display_url_blueprintlot_depth_and_more'),
    ]

    operations = [
        migrations.DeleteModel(
            name='HouseRecommendationHistory',
        ),
    ]
