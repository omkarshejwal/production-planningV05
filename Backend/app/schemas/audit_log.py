from pydantic import BaseModel
from datetime import datetime

class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    action: str
    details: str
    timestamp: datetime

    class Config:
        from_attributes = True
