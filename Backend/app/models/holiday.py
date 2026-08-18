from sqlalchemy import Column, String, Date
from app.db.base import Base, production_table_args

class HolidayMaster(Base):
    __tablename__ = "holiday_master"
    __table_args__ = production_table_args()

    holiday_date = Column(Date, primary_key=True)
    holiday_name = Column(String(150), nullable=False)
