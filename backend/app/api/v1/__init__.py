from .projects import router as projects_router
from .features import router as features_router
from .versions import router as versions_router
from .search import router as search_router
from .auth import router as auth_router
from .roles import router as roles_router
from .uploads import router as uploads_router

__all__ = ["projects_router", "features_router", "versions_router", "search_router", "auth_router", "roles_router", "uploads_router"]
