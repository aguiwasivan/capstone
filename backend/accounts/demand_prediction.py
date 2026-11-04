"""Thirty-day demand prediction from observed availability, without invented history."""
import math
from collections import defaultdict
from datetime import timedelta

from django.utils import timezone

from .models import AnalyticsPredictionModel, Lot, LotDemandObservation, ReservationRequest

HORIZON = timedelta(days=30)
MODEL_KEY = 'lot_demand_30_days'


def features_for(lot, recent_requests=0):
    return {
        'log_price': math.log1p(max(0, float(lot.price or 0))),
        'log_area': math.log1p(max(0, float(lot.area or 0))),
        'recent_requests': recent_requests,
        'subdivision': str(lot.subdivision_id or 'none'),
        'location_zone': lot.location_zone,
    }


def current_features(lots, now=None):
    now = now or timezone.now()
    counts = defaultdict(int)
    for lot_id in ReservationRequest.objects.filter(
        lot_id__in=[lot.pk for lot in lots], created_at__gte=now-HORIZON,
        created_at__lte=now,
    ).values_list('lot_id', flat=True):
        counts[lot_id] += 1
    return {lot.pk: features_for(lot, counts[lot.pk]) for lot in lots}


def capture_observations():
    now = timezone.now()
    day = timezone.localdate(now)
    existing = set(LotDemandObservation.objects.filter(observed_date=day).values_list('lot_id', flat=True))
    lots = list(Lot.objects.filter(status='available').exclude(pk__in=existing)
                .only('id', 'price', 'area', 'subdivision_id', 'location_zone'))
    features = current_features(lots, now)
    LotDemandObservation.objects.bulk_create([
        LotDemandObservation(lot=lot, observed_at=now, observed_date=day, features=features[lot.pk])
        for lot in lots
    ], ignore_conflicts=True)
    return len(lots)


def training_rows():
    now = timezone.now()
    observations = list(LotDemandObservation.objects.filter(observed_at__lte=now-HORIZON).order_by('observed_at', 'id'))
    if not observations:
        return []
    requests = defaultdict(list)
    for lot_id, created in ReservationRequest.objects.filter(
        lot_id__in={row.lot_id for row in observations},
        created_at__gt=observations[0].observed_at, created_at__lte=now,
    ).values_list('lot_id', 'created_at'):
        requests[lot_id].append(created)
    # Nonoverlapping outcomes per lot prevent one request becoming many labels.
    last = {}
    rows = []
    for observation in observations:
        if observation.lot_id in last and observation.observed_at < last[observation.lot_id] + HORIZON:
            continue
        label = int(any(observation.observed_at < when <= observation.observed_at + HORIZON
                        for when in requests[observation.lot_id]))
        rows.append((observation, label))
        last[observation.lot_id] = observation.observed_at
    return rows


def readiness(rows=None):
    rows = training_rows() if rows is None else rows
    positives = sum(label for _, label in rows)
    negatives = len(rows) - positives
    dates = sorted({row.observed_at.date() for row, _ in rows})
    split = dates[max(1, int(len(dates)*0.8))-1] if dates else None
    holdout = [(row, y) for row, y in rows if row.observed_at.date() > split] if split else []
    train = [(row, y) for row, y in rows if row.observed_at + HORIZON < holdout[0][0].observed_at] if holdout else []
    can_train = len(train) >= 30 and sum(y for _, y in train) >= 5 and sum(1-y for _, y in train) >= 5 and len(holdout) >= 10
    return {
        'can_train': can_train, 'valid_observations': len(rows),
        'positive_cases': positives, 'negative_cases': negatives,
        'training_observations': len(train), 'validation_observations': len(holdout),
        'pending_observations': LotDemandObservation.objects.filter(observed_at__gt=timezone.now()-HORIZON).count(),
        'minimums': {'observations': 30, 'positive_cases': 5, 'negative_cases': 5, 'validation_observations': 10},
        'missing_requirements': [] if can_train else ['Mature 30-day availability observations with both outcomes and a later validation period.'],
        'message': 'Ready to train on recorded outcomes.' if can_train else
            'Demand scoring is available. ML needs at least 30 training observations (5 with requests and 5 without), plus 10 later validation observations. Each outcome needs 30 days.',
    }, train, holdout


def train_model():
    capture_observations()
    status, train, holdout = readiness()
    if not status['can_train']:
        return status
    try:
        from sklearn.feature_extraction import DictVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import brier_score_loss
    except ImportError:
        return {**status, 'can_train': False, 'message': 'Install the backend scikit-learn dependency to train predictions.'}
    vectorizer = DictVectorizer(sparse=False)
    x = vectorizer.fit_transform([row.features for row, _ in train])
    y = [label for _, label in train]
    model = LogisticRegression(max_iter=1000, random_state=42).fit(x, y)
    predicted = model.predict_proba(vectorizer.transform([row.features for row, _ in holdout]))[:, 1]
    actual = [label for _, label in holdout]
    evaluation = {
        'brier_score': round(float(brier_score_loss(actual, predicted)), 4),
        'baseline_brier_score': round(float(brier_score_loss(actual, [sum(y)/len(y)]*len(actual))), 4),
        'training_samples': len(train), 'validation_samples': len(holdout),
        'method': 'Later observations, with a 30-day gap after training observations.',
    }
    # Never replace an existing model with one that loses to a constant baseline.
    if evaluation['brier_score'] >= evaluation['baseline_brier_score']:
        return {**status, 'evaluation': evaluation, 'message': 'The candidate did not improve on the historical baseline. Demand scoring or the previously validated model remains active.'}
    AnalyticsPredictionModel.objects.update_or_create(key=MODEL_KEY, defaults={'parameters': {
        'coefficients': dict(zip(vectorizer.get_feature_names_out(), model.coef_[0].tolist())),
        'intercept': float(model.intercept_[0]), 'evaluation': evaluation,
    }})
    return {**status, 'evaluation': evaluation, 'message': 'Demand model trained and validated.'}


def model_predictions(lots):
    model = AnalyticsPredictionModel.objects.filter(key=MODEL_KEY).first()
    if model is None:
        return None, {}
    features = current_features(lots)
    probabilities = {}
    for lot in lots:
        expanded = {f'{key}={value}' if isinstance(value, str) else key:
                    1 if isinstance(value, str) else value for key, value in features[lot.pk].items()}
        logit = model.parameters['intercept'] + sum(
            coefficient*expanded.get(key, 0) for key, coefficient in model.parameters['coefficients'].items())
        probabilities[lot.pk] = 1/(1+math.exp(-max(-35, min(35, logit))))
    return model, probabilities
