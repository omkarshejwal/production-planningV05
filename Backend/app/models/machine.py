from sqlalchemy import Column, Integer
from app.db.base import Base

class MachineMaster(Base):
    __tablename__ = "machine_master"
    __table_args__ = {"schema": "production"}

    machine_no = Column(Integer, primary_key=True, index=True)
    gob_type = Column(Integer, nullable=False)
    max_section = Column(Integer, nullable=False)
