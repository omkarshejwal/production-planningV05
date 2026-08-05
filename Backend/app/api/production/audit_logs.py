from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List

from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["Notification Panel"])

@router.get("/", response_model=List[AuditLogResponse])
def get_audit_logs(db: Session = Depends(get_db)):
    """
    Fetch the most recent 50 audit logs to display in the frontend Notification Panel.
    """
    # We order by timestamp descending so the newest notifications appear at the top!
    logs = db.query(AuditLog).order_by(desc(AuditLog.timestamp)).limit(50).all()
    return logs
