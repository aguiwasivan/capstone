# Analytics behavior and maintenance

Sales, reservations, agent performance, and lot demand use the backend database. The frontend refreshes analytics every 60 seconds while visible and when the window regains focus.

## Agent ownership and pipeline

Use **Reservation Requests → Assigned agent** to assign or clear an agent. Admins, managers, and brokers can assign active agents. Completed reservations cannot be reassigned. The migration backfills ownership only when a reservation has explicitly linked sales identifying one agent; it leaves ambiguous and unlinked requests unassigned.

Reservation conversion is the number of converted assigned reservations divided by all assigned reservations matching the filters. Direct sales do not increase this numerator. Earned commission comes from recorded sales; pending commission remains unavailable because commission payment status is not recorded.

Pipeline estimates multiply current lot prices by the historical conversion rate among resolved requests. Converted requests and declined/cancelled requests form the historical sample. Pending and still-open approved requests are not treated as failures. Agents with fewer than five resolved outcomes use the overall historical rate. This is an empirical estimate, not an ML model or guaranteed revenue. Unassigned approved requests are shown separately. Missing prices contribute no value and are counted in the API's `missing_prices` field. With no resolved history, counts remain visible and projected values remain unavailable.

## Lot-demand predictions

### Zone demand dashboard

The analytics tab now presents Front, Central, and Rear zones instead of individual lot rankings. Each subdivision has a three-row summary and a chart using orange, green, and blue respectively. Zone averages use available, scored lots; empty zones remain unscored, and unassigned lots are counted separately.

The existing demand API and model remain the source. Until a validated model exists, zone averages are explicitly labeled demand scores, not forecasts. With a model, the dashboard sums available-lot request probabilities within each zone to estimate the number of distinct lots receiving at least one request within 30 days. This is not a forecast of total request count. A zone forecast is withheld if any available lot lacks a valid probability.

Without a validated model, a Preliminary Zone Demand Estimate ranks the current zone scores and explains which zones have stronger current signals. Ties share a rank, missing scores are excluded, and a single scored zone does not support a comparative outlook. This estimate updates with the existing analytics refresh and is explicitly described as unvalidated; no reservation counts or probabilities are invented.

The page retains the transparent demand score until a trained model is available. It never labels the score as a probability.

Available-lot observations are recorded once per day when an authorized user opens the lot-demand analytics endpoint. **Update prediction model** also captures observations and attempts training. To capture history on days when nobody opens analytics, run this command daily from the backend directory:

```powershell
./venv/Scripts/python.exe manage.py refresh_analytics_models
```

No operating-system scheduled task is installed automatically. Historical availability is not fabricated from current lot status. Each observation needs 30 days to determine whether the lot received a reservation request. Training uses at least 30 observations, including five positive and five negative outcomes, plus at least ten later validation observations. A 30-day gap separates training observations from validation; overlapping observation windows for the same lot are excluded. Building this history takes multiple months.

The logistic regression model predicts a reservation request within 30 days from recorded price, area, subdivision, location zone, and prior request count. It is activated only when its validation Brier score improves on a constant historical-rate baseline. Failed candidate validation retains the existing model or demand scoring. Model coefficients and evaluation metadata are stored in the database, without executable serialized model files.

## Sales forecast

Sales forecasts use completed calendar months, fill missing months with zero, and exclude the current partial month and future sales from training. At least six completed months are required. The historical totals still include all recorded transactions for reconciliation.

## Verification

The changes include regression tests for permissions, invalid filters, conversion attribution, assignment, pipeline arithmetic, demand observation maturity, model training/inference, and frontend interaction. Backend tests use an isolated SQLite test database. The production database audit is run separately with `analytics_audit_check.py`; it prints only aggregates and statuses. Lot-demand reads now record daily availability observations.

The backend install's original files are preserved under `.analytics-work/originals/`, with reviewed changes in `.analytics-work/backend-changes.patch`.

Verified after installation on October 29, 2026: 42 backend tests and six frontend tests passed; the frontend production build succeeded. Migration 0022 was applied, and Django reported no outstanding model changes. The actual database audit passed 93 checks with zero failures. The former 99-check audit included six payload checks on unauthorized responses; those checks are now skipped because these requests correctly return 401/403. The running HTTP server also returned 401 for anonymous sales analytics. The initial observation capture recorded 128 available lots; there is not yet a validated demand ML model.
