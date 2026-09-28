from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from app.db.base import Base, production_fk, production_table_args

class BottleMaster(Base):
    __tablename__ = "bottle_master"
    __table_args__ = production_table_args()

    bottle_id = Column(Integer, primary_key=True, index=True)
    bottle_name = Column(String(150), nullable=False)
    # Weight in grams is a property of the bottle itself and is therefore shared
    # by every machine it runs on (only the CUT/MIN speeds are machine specific
    # and live in bottle_configuration). Nullable so bottles created before this
    # column existed keep working.
    weight = Column(Numeric(10, 2), nullable=True)


class BottleConfiguration(Base):
    __tablename__ = "bottle_configuration"
    __table_args__ = production_table_args()

    machine_no = Column(Integer, ForeignKey(production_fk("machine_master.machine_no")), primary_key=True)
    bottle_id = Column(Integer, ForeignKey(production_fk("bottle_master.bottle_id")), primary_key=True)
    section = Column(Integer, primary_key=True)
    
    weight = Column(Numeric(10, 2), nullable=False)
    speeds = Column(Numeric(10, 2), nullable=False)
