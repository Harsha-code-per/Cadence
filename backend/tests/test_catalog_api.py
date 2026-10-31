from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.billing.models import DiscountRedemption, Invoice
from apps.catalog.models import (
    Attribute,
    AttributeValue,
    Discount,
    PaymentTerm,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    Tax,
)

pytestmark = pytest.mark.django_db

RESOURCES = (
    "products",
    "variants",
    "attributes",
    "taxes",
    "payment-terms",
    "plans",
    "discounts",
    "quotation-templates",
)


@pytest.fixture
def admin_api(api, make_user):
    api.force_authenticate(make_user(role="admin"))
    return api


@pytest.fixture
def catalog():
    today = timezone.localdate()
    tax = Tax.objects.create(name="GST", rate="18.00")
    product = Product.objects.create(name="CRM", sales_price="1200.00", cost_price="300.00")
    product.taxes.add(tax)
    attribute = Attribute.objects.create(name="Brand")
    value = AttributeValue.objects.create(attribute=attribute, name="Odoo", extra_price="560.00")
    variant = ProductVariant.objects.create(product=product, sku="CRM-ODOO")
    variant.values.add(value)
    plan = Plan.objects.create(name="Monthly", price="100.00", start_date=today)
    term = PaymentTerm.objects.create(name="Net 15", due_days=15)
    discount = Discount.objects.create(
        name="Welcome", discount_type="percent", value=10, start_date=today
    )
    template = QuotationTemplate.objects.create(name="Standard", plan=plan, payment_term=term)
    return {
        "products": (
            product,
            {"name": "New product", "sales_price": "200.00", "tax_ids": [tax.pk]},
        ),
        "variants": (variant, {"product": product.pk, "value_ids": [value.pk], "sku": "NEW"}),
        "attributes": (
            attribute,
            {"name": "Edition", "values": [{"name": "Pro", "extra_price": "25.00"}]},
        ),
        "taxes": (tax, {"name": "New tax", "rate": "5.00"}),
        "payment-terms": (term, {"name": "Net 30", "due_days": 30}),
        "plans": (
            plan,
            {"name": "New plan", "price": "50.00", "start_date": str(today), "tax_ids": [tax.pk]},
        ),
        "discounts": (
            discount,
            {
                "name": "New discount",
                "discount_type": "fixed",
                "value": "10.00",
                "start_date": str(today),
                "product_ids": [product.pk],
            },
        ),
        "quotation-templates": (
            template,
            {
                "name": "New template",
                "plan": plan.pk,
                "lines": [
                    {
                        "product": product.pk,
                        "variant": variant.pk,
                        "quantity": 2,
                        "description": "CRM subscription",
                    }
                ],
            },
        ),
    }


@pytest.mark.parametrize("resource", RESOURCES)
@pytest.mark.parametrize("role", ("admin", "staff", "customer"))
def test_permissions_matrix(api, make_user, catalog, resource, role):
    api.force_authenticate(make_user(role=role))
    instance, payload = catalog[resource]
    url = f"/api/{resource}/"
    detail = f"{url}{instance.pk}/"
    read_status = 403 if role == "customer" else 200
    assert api.get(url).status_code == read_status
    assert api.get(detail).status_code == read_status
    created = api.post(url, payload)
    assert created.status_code == (201 if role == "admin" else 403)
    # Use the new object for writes/deletion: seed objects can be protected by templates.
    target = f"{url}{created.data['id']}/" if role == "admin" else detail
    assert api.patch(target, {}).status_code == (200 if role == "admin" else 403)
    assert api.put(target, payload).status_code == (200 if role == "admin" else 403)
    assert api.delete(target).status_code == (204 if role == "admin" else 403)


@pytest.mark.parametrize("resource", RESOURCES)
def test_anonymous_is_rejected(api, resource):
    assert api.get(f"/api/{resource}/").status_code == 401
    assert api.post(f"/api/{resource}/", {}).status_code == 401


def test_nested_attribute_write(admin_api):
    response = admin_api.post(
        "/api/attributes/",
        {
            "name": "Brand",
            "values": [
                {"name": "Odoo", "extra_price": "560.00"},
                {"name": "Other", "extra_price": "0.00"},
            ],
        },
    )
    assert response.status_code == 201
    attribute_id = response.data["id"]
    url = f"/api/attributes/{attribute_id}/"
    value_id = response.data["values"][0]["id"]
    product = Product.objects.create(name="CRM")
    variant = ProductVariant.objects.create(product=product)
    variant.values.add(value_id)
    response = admin_api.patch(
        url,
        {
            "values": [
                {"id": value_id, "name": "Odoo Pro", "extra_price": "600.00"},
                {"name": "New", "extra_price": "10.00"},
            ]
        },
    )
    assert response.status_code == 200
    assert Attribute.objects.get(pk=attribute_id).values.count() == 2
    assert variant.values.get().pk == value_id
    assert variant.price == Decimal("600.00")
    assert admin_api.patch(url, {"name": "Renamed"}).status_code == 200
    assert AttributeValue.objects.filter(attribute_id=attribute_id).count() == 2
    assert admin_api.patch(url, {"values": []}).data["values"] == []


def test_attribute_rejects_foreign_ids_and_duplicates(admin_api, catalog):
    attribute = catalog["attributes"][0]
    foreign = Attribute.objects.create(name="Foreign")
    value = AttributeValue.objects.create(attribute=foreign, name="Foreign")
    url = f"/api/attributes/{attribute.pk}/"
    for values in (
        [{"id": value.pk, "name": "Stolen"}],
        [{"name": "Duplicate"}, {"name": "Duplicate"}],
    ):
        response = admin_api.patch(url, {"name": "Should not persist", "values": values})
        assert response.status_code == 400
        assert "values" in response.data["error"]["field_errors"]
    attribute.refresh_from_db()
    assert attribute.name == "Brand"


def test_variant_price_and_product_contract(admin_api, catalog):
    variant = catalog["variants"][0]
    url = f"/api/variants/{variant.pk}/"
    response = admin_api.patch(url, {"price": "1.00", "label": "Fake"})
    assert response.status_code == 200
    assert response.data["price"] == "1760.00"
    assert response.data["label"] == "Brand: Odoo"
    assert response.data["value_ids"] == list(variant.values.values_list("id", flat=True))
    product = catalog["products"][0]
    response = admin_api.get(f"/api/products/{product.pk}/")
    assert set(response.data) == {
        "id",
        "name",
        "product_type",
        "sales_price",
        "cost_price",
        "notes",
        "is_active",
        "tax_ids",
        "variants",
    }
    assert response.data["sales_price"] == "1200.00"
    assert response.data["tax_ids"] == [catalog["taxes"][0].pk]
    assert response.data["variants"] == [
        {"id": variant.pk, "label": "Brand: Odoo", "price": "1760.00", "sku": "CRM-ODOO"}
    ]
    admin_api.patch(f"/api/products/{product.pk}/", {"sales_price": "1300.00"})
    assert admin_api.get(url).data["price"] == "1860.00"


def test_nested_template_write(admin_api, catalog):
    payload = catalog["quotation-templates"][1]
    response = admin_api.post("/api/quotation-templates/", payload)
    assert response.status_code == 201
    url = f"/api/quotation-templates/{response.data['id']}/"
    assert response.data["lines"] == payload["lines"]
    assert admin_api.patch(url, {"notes": "Updated"}).data["lines"] == payload["lines"]
    new_lines = [{"product": catalog["products"][0].pk, "quantity": 3, "description": "Replaced"}]
    response = admin_api.patch(url, {"lines": new_lines})
    assert response.status_code == 200
    assert response.data["lines"] == [{**new_lines[0], "variant": None}]
    wrong_product = Product.objects.create(name="Wrong")
    response = admin_api.patch(
        url,
        {
            "notes": "Must not persist",
            "lines": [
                {"product": wrong_product.pk, "variant": catalog["variants"][0].pk, "quantity": 1}
            ],
        },
    )
    assert response.status_code == 400
    assert admin_api.get(url).data["notes"] == "Updated"
    assert admin_api.patch(url, {"lines": []}).data["lines"] == []


def test_plans_available(admin_api):
    today = timezone.localdate()
    yesterday, tomorrow = today - timedelta(days=1), today + timedelta(days=1)
    cases = [
        ("Open", yesterday, None, True, True),
        ("Starts today", today, tomorrow, True, True),
        ("Ends today", yesterday, today, True, True),
        ("Future", tomorrow, None, True, False),
        ("Expired", yesterday, yesterday, True, False),
        ("Inactive", yesterday, None, False, False),
    ]
    expected = []
    for name, start, end, active, available in cases:
        plan = Plan.objects.create(name=name, start_date=start, end_date=end, is_active=active)
        if available:
            expected.append(plan.pk)
    response = admin_api.get("/api/plans/?available=true")
    assert response.status_code == 200
    assert {row["id"] for row in response.data["results"]} == set(expected)
    assert admin_api.get("/api/plans/").data["count"] == 6
    assert admin_api.get("/api/plans/?available=false").data["count"] == 3


def test_discount_times_used_is_derived(admin_api, subscription):
    discount = Discount.objects.create(
        name="Welcome", discount_type="fixed", value=10, start_date=timezone.localdate()
    )
    invoice = Invoice.objects.create(
        number="INV/2026/00001",
        subscription=subscription,
        customer=subscription.customer,
        invoice_date=subscription.start_date,
        due_date=subscription.start_date,
        period_start=subscription.start_date,
        period_end=subscription.start_date,
    )
    redemption = DiscountRedemption.objects.create(discount=discount, invoice=invoice, amount=10)
    url = f"/api/discounts/{discount.pk}/"
    assert admin_api.get(url).data["times_used"] == 1
    assert admin_api.patch(url, {"times_used": 99}).data["times_used"] == 1
    redemption.delete()
    assert admin_api.get(url).data["times_used"] == 0


def test_product_list_query_count(admin_api, catalog, django_assert_num_queries):
    value = catalog["variants"][0].values.get()
    tax = catalog["taxes"][0]
    for i in range(6):
        product = Product.objects.create(name=f"Product {i}", sales_price=100)
        product.taxes.add(tax)
        for _ in range(2):
            variant = ProductVariant.objects.create(product=product)
            variant.values.add(value)
    # Count + products + taxes + variants (joined product) + values (joined attribute).
    with django_assert_num_queries(5):
        response = admin_api.get("/api/products/")
    assert response.status_code == 200
    assert response.data["count"] == 7
    assert all(row["variants"] and row["tax_ids"] for row in response.data["results"])


def test_product_filters_search_ordering_and_pagination(admin_api, catalog):
    Product.objects.create(name="Zebra CRM", product_type="goods", is_active=False)
    Product.objects.create(name="Another CRM")
    response = admin_api.get("/api/products/?search=CRM&is_active=true&ordering=-name&page_size=1")
    assert response.data["count"] == 2
    assert response.data["results"][0]["name"] == "CRM"
    assert response.data["next"] is not None
    assert admin_api.get("/api/products/?product_type=goods").data["count"] == 1
    variant = catalog["variants"][0]
    assert admin_api.get(f"/api/variants/?product={variant.product_id}").data["count"] == 1
    empty_product = Product.objects.create(name="No variants")
    assert admin_api.get(f"/api/variants/?product={empty_product.pk}").data["count"] == 0


@pytest.mark.parametrize(
    ("resource", "invalid"),
    [
        ("products", {"sales_price": "-1.00"}),
        ("taxes", {"rate": "101.00"}),
        ("plans", {"interval_count": 0}),
        ("plans", {"end_date": "2000-01-01"}),
        ("discounts", {"value": "101.00"}),
        ("discounts", {"usage_limit": 0}),
        ("discounts", {"end_date": "2000-01-01"}),
        ("quotation-templates", {"validity_days": 0}),
        ("quotation-templates", {"lines": [{"product": 999999, "quantity": 0}]}),
    ],
)
def test_invalid_input_returns_field_errors(admin_api, catalog, resource, invalid):
    instance = catalog[resource][0]
    response = admin_api.patch(f"/api/{resource}/{instance.pk}/", invalid)
    assert response.status_code == 400
    assert response.data["error"]["code"] == "validation_error"
    assert response.data["error"]["field_errors"]
