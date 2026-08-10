from sqlalchemy import Column, Integer
from app.db.base import Base, production_table_args

class MachineMaster(Base):
    __tablename__ = "machine_master"
    __table_args__ = production_table_args()

    machine_no = Column(Integer, primary_key=True, index=True)
    gob_type = Column(Integer, nullable=False)
    max_section = Column(Integer, nullable=False)
