# Random Forest sales forecasting

Both `GET /api/sales-predictions/` and `POST /api/sales/forecast/` use scikit-learn's `RandomForestRegressor` instead of Damped Holt.

- Features: the three preceding monthly values, ordered oldest to newest.
- Target: the following month's value.
- Configuration: 100 trees, maximum depth 6, random seed 42, one worker.
- Minimum history: six consecutive monthly observations (three training examples). Histories shorter than 12 months carry a limited-data notice in prediction analytics; six months is an implementation minimum, not evidence of accuracy.
- Validation: expanding chronological training windows; each validation target is withheld from training. MAE, RMSE and MAPE are calculated from these forecasts. At six months there are no validation points yet, so error metrics remain null.
- Database history: missing months between the earliest and latest recorded sales are filled with zero totals. The forecast targets the month after the latest recorded sales month. It does not infer unrecorded historical transactions.
- Uploaded history: duplicate or missing months, non-finite/negative amounts and malformed dates are rejected. Include explicit zero-sales months.
- Analytics predict contract value, transaction count and each commission series separately. Existing user-specific sales access remains enforced.

The response model key is `random_forest`; the label is `Random Forest`. The frontend chart and legends use the new key. Install `requirements.txt` when deploying, and restart the backend after installing the new dependency. No database migration is needed.

Random forests average learned tree predictions and do not extrapolate linear growth in the way Holt's trend model does. Changing the model does not guarantee improved accuracy; inspect the chronological validation metrics.

Reference: [scikit-learn RandomForestRegressor documentation](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html).
