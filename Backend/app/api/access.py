# pyrefly: ignore [missing-import]
"""
Database-driven access-control lookup.

The employee-permission table (``auth.user_module_permissions``:
permission_id, employee_id, module_id, can_read, can_edit) joined against the
module master (``auth.module_master``) is the SINGLE SOURCE OF TRUTH for which
modules an employee may view and edit.  Nothing in this module hardcodes
employee ids, module ids or permission values: every lookup is resolved from
those two tables at request time, so a row change takes effect on the very next
request without any redeploy.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings


def _auth_table(name: str) -> str:
    return f"{settings.auth_schema}.{name}" if settings.auth_schema else name


def load_modules(db: Session) -> list[dict]:
    """
    Return the active module catalog from ``module_master``.

    New modules become visible to the whole application (frontend navigation,
    access checks) simply by inserting a row here plus the matching permission
    rows -- no code change required.
    """
    sql = text(
        "SELECT module_id, module_name, parent_module_id, is_active "
        f"FROM {_auth_table('module_master')} "
        "ORDER BY module_id"
    )
    modules: list[dict] = []
    for row in db.execute(sql).mappings():
        if not bool(row["is_active"]):
            continue
        modules.append(
            {
                "module_id": int(row["module_id"]),
                "module_name": row["module_name"],
                "parent_module_id": (
                    int(row["parent_module_id"])
                    if row["parent_module_id"] is not None
                    else None
                ),
                "is_active": bool(row["is_active"]),
            }
        )
    return modules


def load_permissions(employee_id: str, db: Session) -> dict[str, dict[str, bool]]:
    """
    Return {module_name: {"read": bool, "edit": bool}} for an employee.

    The query shape is fixed (exact module/permission join below) so access
    decisions always mirror the database rows.  ``edit`` is normalised to
    ``read AND edit``: can_edit must never grant anything when can_read is
    false.
    """
    sql = text(
        "SELECT u.employee_id, u.employee_name, m.module_name, p.can_read, p.can_edit "
        f"FROM {_auth_table('users')} u "
        f"JOIN {_auth_table('user_module_permissions')} p ON p.employee_id = u.employee_id "
        f"JOIN {_auth_table('module_master')} m ON m.module_id = p.module_id "
        "WHERE u.employee_id = :employee_id "
        "ORDER BY m.module_id"
    )
    result = db.execute(sql, {"employee_id": employee_id})

    permissions: dict[str, dict[str, bool]] = {}
    for row in result.mappings():
        read = bool(row["can_read"])
        permissions[row["module_name"]] = {
            "read": read,
            "edit": read and bool(row["can_edit"]),
        }
    return permissions


def load_access(employee_id: str, db: Session) -> dict:
    """
    One-shot payload for the frontend: the full module catalog plus the
    employee's effective permissions keyed by module_name.
    """
    return {
        "modules": load_modules(db),
        "permissions": load_permissions(employee_id, db),
    }
