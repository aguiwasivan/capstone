"""Run contract checks against isolated SQLite, never the configured live DB."""
import os
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'backend'))
sys.path.insert(0, str(root / 'tests'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.test_settings'
import django
django.setup()
from django.test.runner import DiscoverRunner
raise SystemExit(bool(DiscoverRunner(verbosity=2).run_tests(['backend_contract'])))
