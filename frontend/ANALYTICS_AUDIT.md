# Analytics audit

Status: in progress. Live database checks use backend.settings and the backend virtual environment. No credentials or customer-level records are included in this report.

| Feature / entry points | Data trace | Verification status |
| --- | --- | --- |
| Admin and manager dashboards; standalone Analytics Dashboard; Sales tab | AnalyticsDashboard → SalesDashboard → sales-transactions, sales-analytics, sales-predictions → sales.views → SaleTransactionSerializer / aggregates → SaleTransaction, Lot, User | Reviewing loading/error states, scopes, dates |
| Agent and broker sales dashboards | Role Dashboard → SalesDashboard → same role-scoped endpoints → sales_queryset_for | Reviewing permissions and assigned-sale scope |
| Monthly/yearly sales, commissions, recent-sales table | SalesDashboard → sales-transactions + sales-analytics + forecast history | Comparing summaries, charts, tables |
| Random Forest forecast, validation metrics, SVG chart, insight | SalesModelComparison → sales-predictions → build_model_comparison_response → monthly SaleTransaction aggregates | Reviewing calendar completeness, availability, labels |
| Standalone history forecast API (no React caller) | POST sales/forecast → parse_monthly_sales_rows / random_forest_predict_value | Reviewing auth, validation, model availability |
| Reservation summary, monthly trend, status pie, conversion pie, subdivision chart, top-lots table; standalone + embedded | ReservationAnalytics → analytics/reservations → build_reservation_analytics → ReservationRequest, Lot, Subdivision, SaleTransaction | Reviewing filters, conversions, top-N scope |
| Agent ranking cards/table; sales, reservations, conversion, monthly, commission charts; standalone + embedded | TopPerformingAgentsAnalytics → analytics/top-performing-agents → build_top_performing_agents_analytics → User, SaleTransaction | Found unsupported reservation/conversion/pending-commission metrics |
| Agent pipeline forecast cards/chart/table | TopPerformingAgentsAnalytics → analytics/agent-sales-pipeline-forecast → approved ReservationRequest records | Model and assignment data unavailable by design; reviewing truthful nulls |
| Lot-demand summary/top-lots/block/location charts/table/insights | LotDemandPrediction (AnalyticsDashboard tab) → analytics/lot-demand → available Lot + recent reservations/sales → score/zone aggregates | Rechecking schema, scoping, labels, detail/training APIs |
| Sales & Commission Reports + CSV export (admin/manager) | Reports → sales-report → role-scoped sales aggregates + SaleTransactionSerializer | Found month-filter mismatch between cards and exported/table rows |
| Sales Transactions summary/search/pagination | SalesTransactions → sales-transactions + sales-analytics → scoped SaleTransaction records | Reviewing failures, refresh and page clamping |
| Blueprint inventory cards: total/available/pending/reserved/sold, occupancy, inventory value | InteractiveBlueprint → blueprints + blueprint lots → BlueprintSerializer / BlueprintLotSerializer → BlueprintLot | Reviewing snapshot refresh, errors and inventory denominator |
| Profile system summary, recent activity and report-history tab | Profile → profile/data, profile/summary → build_profile_summary / build_recent_activity → User, Lot, Subdivision, ReservationRequest, SaleTransaction, Notification | Reviewing unavailable report counts and fallback errors |

No report-history storage or commission-payment ledger exists. No agent assignment is stored on reservations. These limitations must be displayed as unavailable, not fabricated zero values or conversion rates.
