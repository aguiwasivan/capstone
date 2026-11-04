from django.urls import path

from .views import (
    SalesAnalyticsView,
    SalesForecastView,
    SalesPredictionView,
    SalesReportView,
    SalesTransactionDetailView,
    SalesTransactionListCreateView,
)


urlpatterns = [
    path('sales-transactions/', SalesTransactionListCreateView.as_view()),
    path('sales-transactions/<int:pk>/', SalesTransactionDetailView.as_view()),
    path('sales-analytics/', SalesAnalyticsView.as_view()),
    path('sales/forecast/', SalesForecastView.as_view()),
    path('sales-predictions/', SalesPredictionView.as_view()),
    path('sales-report/', SalesReportView.as_view()),
]
