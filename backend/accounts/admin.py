from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import SaleTransaction, SystemParameter, User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (
            "Real Estate Registration Info",
            {
                "fields": (
                    "role",
                    "phone_number",
                    "date_of_birth",
                    "address_line1",
                    "address_line2",
                    "city",
                    "province",
                    "postal_code",
                    "buyer_type",
                    "preferred_contact_method",
                    "payment_card_number",
                    "payment_card_name",
                    "payment_card_expiry_month",
                    "payment_card_expiry_year",
                )
            },
        ),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Real Estate Registration Info",
            {
                "fields": (
                    "email",
                    "first_name",
                    "last_name",
                    "role",
                    "phone_number",
                    "buyer_type",
                    "preferred_contact_method",
                )
            },
        ),
    )
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "phone_number",
        "role",
        "buyer_type",
        "is_staff",
        "is_active",
    )


@admin.register(SystemParameter)
class SystemParameterAdmin(admin.ModelAdmin):
    list_display = ("key", "label", "value", "updated_at")
    search_fields = ("key", "label")


@admin.register(SaleTransaction)
class SaleTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "project",
        "sale_date",
        "total_contract_price",
        "agent",
        "manager",
        "broker",
        "created_by",
    )
    list_filter = ("sale_date", "agent", "manager", "broker")
    search_fields = ("project", "developer", "notes")
