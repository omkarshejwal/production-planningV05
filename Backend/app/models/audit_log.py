from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    
    # Who made the change?
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # What did they do? (e.g., "UPDATED JOB")
    action = Column(String, nullable=False) 
    
    # Specific details (e.g., "Changed required_bottles from 100 to 500")
    details = Column(String) 
    
    # Automatically records the exact time the change happened
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
