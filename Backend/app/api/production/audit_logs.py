# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from sqlalchemy import desc
from typing import List

from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogResponse
from app.api.permissions import require_any_active_module_read
from app.api.auth import get_current_user
from app.models.auth import AuthUser

router = APIRouter(prefix="/audit-logs", tags=["Notification Panel"])

@router.get("/", response_model=List[AuditLogResponse])
def get_audit_logs(
    db: Session = Depends(get_db),
    # Cross-module feed: requires an authenticated employee with read access on
    # at least one active module (resolved dynamically from module_master).
    _user: AuthUser = Depends(require_any_active_module_read()),
):
    """
    Fetch the most recent 50 audit logs to display in the frontend Notification Panel.
    """
    # We order by timestamp descending so the newest notifications appear at the top!
    logs = db.query(AuditLog).order_by(desc(AuditLog.timestamp)).limit(50).all()
    return logs
