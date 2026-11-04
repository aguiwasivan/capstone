"""Run a separate LAN development API process without editing backend files."""
import argparse
import os
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--host', required=True, help='Your computer Wi-Fi IPv4 address')
parser.add_argument('--port', default='8001', type=int)
args = parser.parse_args()
backend = Path(__file__).resolve().parents[2] / 'backend'
sys.path.insert(0, str(backend))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
from django.conf import settings
settings.ALLOWED_HOSTS = list(set(settings.ALLOWED_HOSTS + [args.host, '127.0.0.1', 'localhost', '10.0.2.2']))
from django.core.management import execute_from_command_line
execute_from_command_line(['manage.py', 'runserver', f'0.0.0.0:{args.port}', '--noreload'])
