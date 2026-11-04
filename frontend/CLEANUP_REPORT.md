# Project cleanup report — October 30, 2026

## Result

The approved cleanup groups **S1-S8** were completed successfully.

- Files removed: **6,719**
- Space recovered: **361,908,109 bytes (345.14 MiB)**
- Files skipped because they changed: **0**
- Deletion errors: **0**
- Approved deletion targets remaining: **0**

The exact deletion record is stored in `.cleanup-audit/cleanup-execution.json`. The original review manifest remains in `.cleanup-audit/proposal.json` and `.cleanup-audit/file-classification.csv`.

## Removed

- The unused legacy stylesheet `frontend/front/src/pages/clients/Properties.css`.
- The empty scaffold `backend/test.py`.
- Four byte-identical loose CSV samples. Canonical copies remain in `frontend/front/public/`.
- Project Python bytecode caches outside the virtual environment.
- Frontend Babel, Webpack development, and ESLint caches.
- Generated mobile test output and mobile ESLint cache.
- Three one-off analytics inspection/benchmark artifacts.

Verification temporarily regenerated frontend and mobile output. Those temporary verification artifacts were removed again after the checks passed.

## Protected and retained

The cleanup retained and rechecked:

- `backend/db.sqlite3` and the configured application database.
- Backend and frontend environment files.
- All Django migration source files.
- `frontend/cotta-zone-backup.json`.
- Canonical public CSV samples.
- Current web and mobile deployment outputs: `frontend/front/build/` and `mobile/dist/`.
- Blueprint images/storage references, polygon coordinates, subdivision data, authentication, APIs, analytics, reports, Correction Mode, and polygon editing code.
- All files categorized as **Needs Review** in `CLEANUP_PROPOSAL.md`.
- Installed environments and dependencies.

## Verification after cleanup

| Check | Result |
|---|---|
| Django system check with isolated test settings | Passed, zero issues |
| Backend tests with isolated in-memory SQLite | **52/52 passed** |
| Python dependency integrity | Passed |
| Frontend production build in a separate verification directory | Passed |
| Frontend local import graph | Passed; no unreachable production source or unresolved production imports |
| Mobile tests | **13/13 passed** |
| Mobile Expo lint | Passed |
| Mobile TypeScript typecheck | Passed |
| Protected-file existence check | Passed |

The mobile test source imports `.test-build` files because its `npm test` command generates them first. They are intentionally absent after cleanup and will be recreated automatically on the next mobile test run.

## Existing frontend check failures

Two frontend issues existed before cleanup and remained identical afterward:

- `front/src/components/SalesModelComparison.test.jsx:35`: the chart test expects more than one rendered x-axis tick but receives zero in the test environment.
- `front/src/hooks/useAnalyticsRefresh.test.js:15`: ESLint reports `testing-library/no-unnecessary-act`.

Frontend results remain **25 passing tests and 1 failing test** across **11 passing suites and 1 failing suite**. These failures were not introduced by cleanup. No unrelated code changes were made to hide or fix them.

## Recovery

Source-level deletions are recorded in `.cleanup-audit/cleanup-execution.json` and may also be recoverable from the relevant Git repository history. Generated caches and mobile test output are recreated by normal build, lint, and test commands. The removed loose CSV files remain available through their retained canonical copies under `frontend/front/public/`.
