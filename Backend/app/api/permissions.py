# pyrefly: ignore [missing-import]
"""
Module-level permission dependencies (replaces the old role-based RBAC).

GET/view endpoints depend on ``require_module_read(<Module Name>)``.
POST/PUT/PATCH/DELETE endpoints depend on ``require_module_edit(<Module Name>)``.

Rules (mirrored by the frontend):
  - can_read == False  -> no access to the module at all.
  - can_read + can_edit == True -> full access.
  - can_read + can_edit == False -> view-only (all mutations return 403).
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.access import load_permissions
from app.api.auth import get_current_user
from app.db.session import get_db
from app.models.auth import AuthUser

MODULE_PRODUCTION_PLANNING = "Production Planning"
MODULE_QUALITY_CONTROL = "Quality Control"
MODULE_BOTTLE_MASTER = "Bottle Master"
MODULE_HOLIDAY_MASTER = "Holiday Master"


def _deny(module: str, action: str):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Forbidden: {action} access to {module} is required.",
    )


def require_module_read(module: str):
    def dependency(
        user: AuthUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AuthUser:
        permissions = load_permissions(user.employee_id, db)
        if not permissions.get(module, {}).get("read"):
            _deny(module, "read")
        return user

    return dependency


def require_module_edit(module: str):
    def dependency(
        user: AuthUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AuthUser:
        permissions = load_permissions(user.employee_id, db)
        permission = permissions.get(module, {})
        if not permission.get("read") or not permission.get("edit"):
            _deny(module, "edit")
        return user

    return dependency


def require_any_module_read(modules: list[str]):
    """
    Allow a read/view endpoint when the user may read ANY of the listed modules.
    Used by reference data that several modules consume (e.g. bottle master is
    read by both Production Planning and Bottle Master).
    """
    def dependency(
        user: AuthUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AuthUser:
        permissions = load_permissions(user.employee_id, db)
        if not any(permissions.get(m, {}).get("read") for m in modules):
            _deny(" or ".join(modules), "read")
        return user

    return dependency