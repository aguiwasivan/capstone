# Project cleanup proposal — October 30, 2026

**Status: approved groups S1-S8 were deleted on October 30, 2026. No application database records were changed. See [CLEANUP_REPORT.md](CLEANUP_REPORT.md) for execution and verification results.**

All paths below are relative to `C:/Users/Toji(K)/Downloads/CAPSTONE/CAPSTONE/`.

## Recommendation

Approve only **S1–S8** for the first cleanup. This proposes removing **6,719 files totaling 361,908,109 bytes (345.14 MiB)**, overwhelmingly regenerable compiler caches. Counts and sizes are a snapshot; running development tools can change caches.

The complete path-by-path list, category, reason, and available content hashes are in [file-classification.csv](.cleanup-audit/file-classification.csv). The bounded approval manifest is [proposal.json](.cleanup-audit/proposal.json). Approval of an S group applies only to the paths listed in that group, not an unrestricted recursive deletion.

## Safe to Delete — after approval

| ID | Proposed files | Count | Reason |
|---|---|---:|---|
| S1 | `frontend/front/src/pages/clients/Properties.css` | 1 | Legacy stylesheet has no import, CSS import, HTML link, or runtime loader reference. The current page renders `InteractiveBlueprint`, which imports `LotBlueprint.css`. |
| S2 | `backend/test.py` | 1 | Zero-byte scaffold with no tests or references. The actual Django test suites remain in `accounts/` and `sales/`. |
| S3 | Four loose CSV copies listed below | 4 | Byte-identical to retained copies under `frontend/front/public/`; SHA-256 verified. No source references to the loose paths were found. |
| S4 | The 56 `.pyc` files in the eight project cache directories listed below | 56 | Generated Python bytecode, outside the virtual environment. All `.py` sources, including migrations, stay. |
| S5 | Listed files under `frontend/front/node_modules/.cache/` | 6,647 | Babel, Webpack development, and ESLint caches. About 344.70 MiB. Dependency packages and production builds stay. |
| S6 | Six compiled files under `mobile/.test-build/`, listed below | 6 | Generated test output. The configured `npm test` regenerates the current output before running tests. |
| S7 | `mobile/.expo/cache/eslint/.cache_1hsybxv` | 1 | Regenerable ESLint cache. Expo device and server settings stay. |
| S8 | Three diagnostics listed below | 3 | One-off inspection/benchmark scripts and a derived chart response, not referenced by app startup, routes, or tests. |

S3 exact paths:

- `sales_2025_sample.csv`
- `sales_missing_months_sample.csv`
- `frontend/sales_2025_sample.csv`
- `frontend/sales_missing_months_sample.csv`

Retain `frontend/front/public/sales_2025_sample.csv` and `frontend/front/public/sales_missing_months_sample.csv` as the canonical downloadable samples. Retain their production-build copies too. If you still select a loose copy manually for imports, use the retained public copy after cleanup.

S4 cache directories containing the specifically listed `.pyc` files:

- `backend/accounts/__pycache__/`
- `backend/accounts/management/__pycache__/`
- `backend/accounts/management/commands/__pycache__/`
- `backend/accounts/migrations/__pycache__/`
- `backend/backend/__pycache__/`
- `backend/sales/__pycache__/`
- `backend/sales/migrations/__pycache__/`
- `mobile/tests/__pycache__/`

Only the listed bytecode files are proposed, not migration source files or an entire app directory. Before clearing active caches, stop the relevant development processes; the first subsequent startup or build may be slower.

S6 exact paths:

- `mobile/.test-build/client.js`
- `mobile/.test-build/properties.js`
- `mobile/.test-build/types.js`
- `mobile/.test-build/src/lib/client.js`
- `mobile/.test-build/src/lib/properties.js`
- `mobile/.test-build/src/lib/types.js`

The current test configuration outputs the first three files. The nested three are older output; `properties.js` and `types.js` are exact duplicates across those locations. Use `npm test` to regenerate output before running the test files directly.

S8 exact paths:

- `frontend/.analytics-work/inspect_sales_chart.py` — one-off API chart inspection; writes the next file.
- `frontend/.analytics-work/sales-chart-response.json` — captured, derived analytics response; not an application database or input fixture.
- `frontend/.analytics-work/measure_subdivision_loading.py` — one-off local endpoint timing utility.

## Needs Review — retain unless separately approved

| ID | Files or group | Why not automatically delete |
|---|---|---|
| R1 | Nonprotected files in `frontend/.analytics-work/`, excluding S8 | Includes staged backend source, rollback originals, installers, and patches. `analytics_audit_check.py --staged` explicitly imports this tree. Some copies are older than the live backend. Retiring it needs a decision about the staged-audit workflow and rollback retention. |
| R2 | `backend/analytics-build/` | An older generated React bundle. No source route references were found, but a static server or external deployment may serve it. It differs from the current build; this is not a harmless duplicate. |
| R3 | `mobile/assets/splash-icon.png`, `favicon.png`, `android-icon-monochrome.png`, `android-icon-background.png` | No literal reference in current mobile source/configuration, but build defaults and earlier release assets require confirmation. Keep until an export/build verifies the asset requirements. |
| R4 | `frontend/assign_cotta_zones.py` | Completed one-off database assignment script, but potentially useful for audit/reproduction. Do not rerun it as part of cleanup. |
| R5 | `frontend/analytics_audit_live.json`, `frontend/ANALYTICS_AUDIT.md`, `backend/CLEANUP_REPORT.md`, `backend/MANUAL_REVIEW.md`, `backend/docs/analytics-data-gaps.json` | Historical evidence and diagnostics. Some statements are outdated, but that alone does not make the files disposable. |
| R6 | `mobile/.expo/dev/logs/start.log`, `mobile/.expo/dev/logs/export.log` | Generated logs; first confirm debugging need and whether a process is actively writing them. |

**Do not approve a blanket removal of `.analytics-work/`.** It contains migration copies and configuration files that remain protected under your instructions. The CSV separates these from review candidates. No current deployment artifact will be deleted without verifying it is not required.

Additional findings requiring code review, not whole-file deletion:

- `frontend/front/src/pages/shared/lotDemandUtils.js`: `demandTablePage()` is now referenced only by its tests, after the zone dashboard replaced the lot table. Other exports in this file remain active. Keep the file; removing the helper and updating tests would be a separate approved code edit.
- `frontend/front/src/pages/shared/LotDemandPrediction.css`: old pagination/grid/sample selectors appear unused after the recent redesign. The stylesheet itself is active and must stay. No selectors were edited in this audit.
- Root dependencies (`axios`, `jwt-decode`, `react-router-dom`) have no demonstrated root application entry point; web and mobile have separate manifests. Keep root package files, installed modules, and portable Node tools until the local tooling setup is reviewed. Configuration changes are outside this deletion proposal.

## Keep — explicitly protected

- `backend/db.sqlite3`, all application database records, `.env` and example environment files, Django settings, URL configuration, app configuration, manifests, lockfiles, and deployment configuration.
- Every Django migration source file, including copies within the staged audit tree, and Python package markers such as `__init__.py`.
- `frontend/cotta-zone-backup.json`: contains the previous location assignments and is a data rollback artifact.
- All blueprint images, uploaded media, storage objects, polygon coordinates, and subdivision data. The code uses database fields and Supabase URLs; no storage or database cleanup was attempted.
- Current deployment outputs: `frontend/front/build/` and `mobile/dist/`. Generated does not mean safe to delete when it may be deployed.
- Installed environments: `backend/venv/`, `frontend/front/node_modules/` except S5 cache files, `mobile/node_modules/`, root `node_modules/`, root Node executable and launcher scripts.
- Version-control directories, agent instructions, Expo settings/device configuration, design diagrams, schema SQL, licenses, and maintenance documentation.
- All active React pages/components, 19 active stylesheets, Django application modules, API/authentication code, reporting/analytics, Correction Mode, and polygon editing/viewing code.
- All real test suites, including failing tests. Tests are discovered by naming conventions and need not be imported by production code.
- Both `frontend/front/src/pages/admin/Dashboard.js` and `frontend/front/src/pages/manager/Dashboard.js`: exact duplicates, but each is an active role route. Deleting either would break an import; consolidation would be a refactor.
- `frontend/front/public/logo192.png`, `logo512.png`, and `favicon.ico`: used by `index.html`/`manifest.json`. Their copies in built assets are expected deployment duplication.
- `frontend/front/scripts/strip-zoom-sourcemaps.js`: used by the package's `postinstall` script.
- Django `apps.py`, `admin.py`, `asgi.py`, `wsgi.py`, test settings, and management commands: used through Django discovery, settings, CLI, or deployment, even without ordinary imports.
- The newly generated `.cleanup-audit/` evidence and this proposal, until cleanup review and verification are complete.

## Analysis performed

- Inventoried **429 first-party/source, generated, documentation, and local-data files**, plus **6,647 frontend cache files**. Installed dependency internals and Git internals were excluded from dead-source classification and retained.
- Parsed JS/JSX/TS/TSX/CommonJS imports, exports, literal dynamic imports, and `require()` calls in **76 source/script/config/test files**, resolving relative file and index imports. No unresolved local imports or computed import loaders were found in that scan.
- Traced **66 web runtime files** from `src/index.js`. Of **79 web source files**, **12 are tests** and **one stylesheet is unreachable**. No unused whole React component/page was found.
- Accounted for Expo Router's filesystem-discovered routes: all **13 mobile source files** are reachable from route entry points. Mobile configuration was also inspected.
- Parsed Python imports and syntax, including **62 files in the actual backend**. Reviewed `INSTALLED_APPS`, middleware, authentication settings, Django URL includes, model references, admin discovery, migrations, management commands, and the isolated test settings.
- Checked HTML/manifest assets, CSS imports/URLs, scripts, public files, package lifecycle hooks, documentation references, and mobile build configuration. Reviewed storage handling without querying stored records.
- Compared nonempty file content by SHA-256: **58 duplicate groups**, mainly expected staged source copies and deployed assets. Duplicates were not automatically considered deletable.
- Verified all **7 web**, **20 mobile**, and **3 root** declared JS dependencies are installed within their declared ranges. All web runtime/build dependencies have a source or toolchain role.
- Retained Python requirements: Django/DRF/auth/CORS, database adapter, dotenv, OpenAI/OpenCV blueprint detection, scikit-learn analytics, and framework/transitive pins. `numpy` is imported and installed transitively; dependency declaration changes are not part of cleanup.
- Did not execute location-assignment, analytics synchronization, daily observation capture, installation, or live API audit scripts. Some of those mutate application data even during apparently read-oriented checks.
- Rechecked the recorded file hashes after analysis: **no inventoried hashed project file changed**. Only the new audit evidence and proposal were written.

## Baseline checks before deletion

| Check | Result |
|---|---|
| Backend syntax/import analysis | Passed |
| Django system check using `backend.test_settings` | Passed, zero issues |
| Backend tests using isolated in-memory SQLite | **52 passed**; existing database not used |
| Python dependency integrity (`pip check`) | Passed |
| Web local import graph and declared dependency checks | Passed |
| Web tests | **25 passed, 1 failed**; 11 suites passed, 1 failed |
| Web lint | **1 existing error** in a test file |
| Mobile lint without cache | Passed |
| Mobile TypeScript `--noEmit` | Passed |
| Web production build | Most recent build immediately before this audit compiled successfully. Not rebuilt during initial analysis, to preserve the deployment output. |

Existing web failures, not caused by cleanup:

- `front/src/components/SalesModelComparison.test.jsx:35`: expected more than one rendered chart axis tick; received zero.
- `front/src/hooks/useAnalyticsRefresh.test.js:15`: ESLint `testing-library/no-unnecessary-act`.

Logs and exact commands are under `.cleanup-audit/`. A console-encoding error affected printing the tail of two audit logs; their full UTF-8 logs and actual check exit codes were saved successfully. The audit wrapper's console encoding has been corrected. No application code was changed to hide failures.

## After approval

1. Confirm the approved S IDs or exact paths. Retain all review/protected files.
2. Resolve each path within this project root and recheck it against the manifest. Recheck hashes for source/duplicate files; skip changed or newly created files rather than expanding approval automatically.
3. Coordinate stopping only relevant development processes before clearing their caches. Do not stop an unrelated service or remove an active log.
4. Delete only approved files. Do not use blanket deletion of mixed directories, source trees, environments, databases, or media.
5. Re-run import/dependency checks, frontend tests/lint, Django checks and all backend tests with the isolated in-memory settings. If mobile outputs are approved, regenerate test output and run the mobile tests/typecheck/lint too.
6. Build the frontend into a separate verification directory, preserving existing deployment artifacts. Smoke-check available authentication, analytics, and blueprint/Correction Mode routes without modifying production data.
7. Compare results against this baseline and report any newly introduced failures separately. Do not silently refactor or fix unrelated failures.

**Approval requested: S1–S8 only, or specify the subset you want removed. No deletions will occur until you confirm.**
