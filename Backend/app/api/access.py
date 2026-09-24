# pyrefly: ignore [missing-import]
"""
Database-driven access-control lookup.

load_permissions() runs the canonical permission query against the ``auth``
schema.  Module names follow the rows in auth.module_master exactly:
"Production Planning", "Quality Control", "Bottle Master", "Holiday Master".
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings


def _auth_table(name: str) -> str:
    return f"{settings.auth_schema}.{name}" if settings.auth_schema else name


def load_permissions(employee_id: str, db: Session) -> dict[str, dict[str, bool]]:
    """
    Return {module_name: {"read": bool, "edit": bool}} for an employee.

    The query shape is fixed (exact module/permission join below) so access
    decisions always mirror the database rows.
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
        permissions[row["module_name"]] = {
            "read": bool(row["can_read"]),
            "edit": bool(row["can_edit"]),
        }
    return permissions