from django.core.management.base import BaseCommand
from accounts.demand_prediction import capture_observations, train_model


class Command(BaseCommand):
    help = 'Capture available-lot observations and train when mature outcomes are sufficient. Run daily.'

    def handle(self, *args, **options):
        count = capture_observations()
        status = train_model()
        self.stdout.write(f'Captured {count} observations. {status["message"]}')
