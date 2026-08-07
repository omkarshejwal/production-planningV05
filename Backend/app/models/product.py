from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from app.db.base import Base

class BottleMaster(Base):
    __tablename__ = "bottle_master"
    __table_args__ = {"schema": "production"}

    bottle_id = Column(Integer, primary_key=True, index=True)
    bottle_name = Column(String(150), nullable=False)


class BottleConfiguration(Base):
    __tablename__ = "bottle_configuration"
    __table_args__ = {"schema": "production"}

    machine_no = Column(Integer, ForeignKey("production.machine_master.machine_no"), primary_key=True)
    bottle_id = Column(Integer, ForeignKey("production.bottle_master.bottle_id"), primary_key=True)
    section = Column(Integer, primary_key=True)
    
    weight = Column(Numeric(10, 2), nullable=False)
    speeds = Column(Numeric(10, 2), nullable=False)
