"""Analytics verification; output aggregates/statuses, never credentials or identities.

Lot-demand GET requests also capture the application's daily availability observations.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
from decimal import Decimal

workspace = Path(__file__).resolve().parent
actual = workspace.parent / 'backend'
staged = '--staged' in sys.argv
sys.path.insert(0, str(actual))
from dotenv import load_dotenv
load_dotenv(actual / '.env', override=True)
if staged:
    sys.path.insert(0, str(workspace / '.analytics-work/backend'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
import django
with contextlib.redirect_stdout(io.StringIO()):
    django.setup()
from django.apps import apps
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Sum
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User, Lot, Subdivision, SaleTransaction, ReservationRequest

results = []
def record(name, passed, detail=''):
    results.append({'check': name, 'passed': bool(passed), 'detail': detail})
    print(name, 'PASS' if passed else 'FAIL', detail, flush=True)

def request(client, url):
    try:
        with contextlib.redirect_stderr(io.StringIO()):
            response = client.get('/api/' + url)
        return response.status_code, response.data
    except Exception as error:
        return 500, {'error_type': type(error).__name__}

try:
    executor = MigrationExecutor(connection)
    plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
    record('migration history', not plan, str([(m.app_label, m.name) for m, backwards in plan]))
    missing = []
    with connection.cursor() as cursor:
        for model in apps.get_models():
            if model._meta.app_label not in ('accounts', 'sales'):
                continue
            columns = {c.name for c in connection.introspection.get_table_description(cursor, model._meta.db_table)}
            missing.extend(f'{model._meta.db_table}.{field.column}' for field in model._meta.local_fields if field.column not in columns)
    record('all application model columns', not missing, str(missing))
    print('Reporting timezone:', timezone.get_current_timezone_name(), flush=True)
    admin = User.objects.filter(role='admin', is_active=True).first()
    client = APIClient()
    for role in ('admin', 'manager', 'agent', 'broker', 'client', 'anonymous'):
        user = User.objects.filter(role=role, is_active=True).first() if role != 'anonymous' else None
        if role != 'anonymous' and user is None:
            print(role, 'SKIPPED: no active database user', flush=True)
            continue
        client.force_authenticate(user)
        sales = SaleTransaction.objects.all() if role == 'admin' else SaleTransaction.objects.filter(**{role: user}) if role in ('manager', 'agent', 'broker') else SaleTransaction.objects.none()
        with override_settings(ALLOWED_HOSTS=['testserver'], DEBUG=False):
            for url in ('sales-transactions/', 'sales-analytics/', 'sales-predictions/', 'sales-report/', 'analytics/reservations/', 'analytics/top-performing-agents/', 'analytics/agent-sales-pipeline-forecast/', 'analytics/lot-demand/', 'profile/summary/', 'profile/data/'):
                code, data = request(client, url)
                report_only = url == 'sales-report/' or url.startswith('analytics/')
                allowed = role in ('admin', 'manager') if report_only else role != 'anonymous' if url.startswith('profile/') else role in ('admin', 'manager', 'agent', 'broker')
                record(f'{role} {url}', code == 200 if allowed else code in (401, 403), f'HTTP {code}')
                if code != 200:
                    continue
                if url == 'sales-transactions/':
                    record(f'{role} transaction scope', {row['id'] for row in data} == set(sales.values_list('id', flat=True)), f'{len(data)} rows')
                if url in ('sales-analytics/', 'sales-report/'):
                    total = sales.aggregate(value=Sum('total_contract_price'))['value'] or Decimal(0)
                    record(f'{role} sales totals', data['summary']['total_sales'] == sales.count() and Decimal(str(data['summary']['total_contract_price'] or 0)) == total, f'{sales.count()} sales; TCP {total}')
                if url == 'sales-predictions/':
                    record(f'{role} monthly history totals', sum(Decimal(row['total_contract_price']) for row in data['history']) == (sales.aggregate(value=Sum('total_contract_price'))['value'] or 0))
                if url == 'analytics/reservations/':
                    record(f'{role} reservation totals', data['summary']['total_reservations'] == ReservationRequest.objects.count() == sum(row['count'] for row in data['status_distribution']) == sum(row['reservation_count'] for row in data['monthly_reservations']))
                if url == 'analytics/top-performing-agents/':
                    assigned = SaleTransaction.objects.filter(agent__role='agent')
                    record(f'{role} agent TCP', Decimal(str(data['summary']['total_sales_amount'])) == (assigned.aggregate(value=Sum('total_contract_price'))['value'] or 0))
    client.force_authenticate(admin)
    with override_settings(ALLOWED_HOSTS=['testserver'], DEBUG=False):
        for subdivision in Subdivision.objects.all():
            code, data = request(client, f'analytics/lot-demand/?subdivision_id={subdivision.pk}')
            available = Lot.objects.filter(subdivision=subdivision, status='available')
            good = code == 200 and {row['lot_id'] for row in data['predictions']} == set(available.values_list('pk', flat=True))
            if good:
                for zone in data['distribution_by_zone']:
                    members = [row for row in data['predictions'] if row['location_zone'] == zone['location_zone']]
                    scores = [row['demand_score'] for row in members if row['demand_score'] is not None]
                    good &= zone['available_lots'] == len(members) and zone['scored_lots'] == len(scores) and zone['average_score'] == (round(sum(scores) / len(scores), 2) if scores else None)
            record(f'subdivision {subdivision.pk} lot demand', good, f'{available.count()} available lots')
        for url in ('analytics/reservations/?start_date=bad', 'analytics/reservations/?subdivision_id=bad', 'analytics/top-performing-agents/?year=bad', 'analytics/top-performing-agents/?start_date=2026-02-01&end_date=2026-01-01'):
            code, _ = request(client, url)
            record('invalid filters ' + url, code == 400, f'HTTP {code}')
except Exception as error:
    record('audit execution', False, type(error).__name__ + ' (details withheld)')
finally:
    (workspace / ('analytics_audit_staged.json' if staged else 'analytics_audit_live.json')).write_text(json.dumps(results, indent=2))
    print('Checks:', len(results), 'Failures:', sum(not row['passed'] for row in results), flush=True)
