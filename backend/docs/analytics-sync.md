# Analytics data synchronization

Sales, commissions, reservation summaries and agent performance read the application database directly. Published blueprint inventory is copied into the Lot records used by reservation and demand analytics on publication and on map lot edits.

Backfill existing published inventory with:

```powershell
./venv/Scripts/python.exe manage.py sync_analytics --dry-run
./venv/Scripts/python.exe manage.py sync_analytics
```

The command is transactional and repeatable. It updates area, price, geometry, location and status, retaining sold/reserved/pending states supported by transaction history. Drafts and open spaces are excluded. Ambiguous subdivision/block/lot identities are skipped and counted: correct missing block numbers or duplicate map entries before rerunning. No sales, commissions, agent assignments or historical activity are fabricated.

Analytics pages reload every 30 seconds while visible and when the window regains focus. Staff forecasts retain the server's permission-scoped results. Subdivision reservation totals include all matching reservations, independently of the top-ten lot chart.

Some analytics cannot be populated by synchronization alone: pipeline forecasts require recorded agent assignments and a conversion model; machine-learning demand forecasts require historical availability and activity observations. The existing application continues to explain these limitations.

Validation:

```powershell
./venv/Scripts/python.exe manage.py test accounts sales --settings=backend.test_settings
```

This test configuration uses an isolated in-memory SQLite database.
