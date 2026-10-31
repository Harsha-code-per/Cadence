from django.contrib import admin

from apps.catalog import models as m


class AttributeValueInline(admin.TabularInline):
    model = m.AttributeValue
    extra = 0


class TemplateLineInline(admin.TabularInline):
    model = m.QuotationTemplateLine
    extra = 0


@admin.register(m.Attribute)
class AttributeAdmin(admin.ModelAdmin):
    inlines = [AttributeValueInline]


@admin.register(m.Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "product_type", "sales_price", "cost_price", "is_active")
    search_fields = ("name",)


@admin.register(m.QuotationTemplate)
class QuotationTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "plan", "validity_days")
    inlines = [TemplateLineInline]


@admin.register(m.Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "price", "billing_period", "interval_count", "is_active")


@admin.register(m.Discount)
class DiscountAdmin(admin.ModelAdmin):
    list_display = ("name", "discount_type", "value", "scope", "start_date", "end_date")


admin.site.register([m.Tax, m.PaymentTerm, m.ProductVariant])
