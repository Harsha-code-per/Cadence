from rest_framework.routers import SimpleRouter

router = SimpleRouter()
# router.register("resource", ResourceViewSet, basename="resource")

urlpatterns = [*router.urls]
