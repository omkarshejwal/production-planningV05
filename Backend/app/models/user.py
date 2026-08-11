from sqlalchemy import Boolean, Column, DateTime, String, func
from app.db.base import Base
from app.db.base import production_table_args

class User(Base):
    __tablename__ = "users"
    __table_args__ = production_table_args()

    employee_id = Column(String, primary_key=True, index=True)
    employee_name = Column(String, nullable=False)
    department = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone_number = Column(String, nullable=False, index=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
