# Manual Review Required

Items below were not automatically removed because they may be local runtime data, generated environments, deployment artifacts, documentation, or dependency pins whose intent cannot be proven from source references alone.

## Medium Confidence

- `frontend/front/build/`
  - Reason: generated React production build and ignored by `frontend/front/.gitignore`, but deleting it removes the currently built artifact. Rebuild can recreate it.
  - Confidence level: Medium
- `frontend/front/node_modules/`
  - Reason: generated dependency install and ignored by `frontend/front/.gitignore`, but required for local build/test commands without reinstalling.
  - Confidence level: Medium
- `backend/venv/`
  - Reason: generated Python virtual environment and ignored by `backend/.gitignore`, but required for local validation commands without reinstalling.
  - Confidence level: Medium
- `backend/db.sqlite3`
  - Reason: ignored by `backend/.gitignore` and not used by current PostgreSQL settings, but may contain local data.
  - Confidence level: Medium
- Root `package.json`, `package-lock.json`, and root `node_modules/`
  - Reason: root package has no scripts/source and duplicates frontend dependencies, but root Node tooling is present in the same directory and may be part of the local setup.
  - Confidence level: Medium
- `backend/docs/` and `frontend/system-design-docs/`
  - Reason: documentation is not imported by runtime code, but design docs are project artifacts rather than dead application code.
  - Confidence level: Medium
- `npm audit` findings in `frontend/front`
  - Reason: npm reported 41 vulnerabilities after dependency cleanup. Fixing them may require dependency upgrades and should be reviewed separately from dead-code removal.
  - Confidence level: Medium

## Low Confidence

- Duplicate serializer validation patterns in `accounts/serializers.py`
  - Reason: payment-card and username-building validation logic is similar across serializers. Consolidation is possible, but refactoring validation paths changes behavior risk and should be covered by focused tests first.
  - Confidence level: Low
- Explicit Python transitive pins: `asgiref`, `sqlparse`, `tzdata`, `PyJWT`
  - Reason: these are required by Django or SimpleJWT transitively. They may be redundant direct pins, but keeping them can be intentional for reproducible installs.
  - Confidence level: Low
- Frontend dependency updates reported by `npm outdated`
  - Reason: `react`, `react-dom`, and `react-router-dom` have newer wanted/latest versions, but upgrading dependencies is not the same as unused-code cleanup and may change behavior.
  - Confidence level: Low
