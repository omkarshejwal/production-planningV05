from pydantic import BaseModel
from datetime import date

class HolidayMasterBase(BaseModel):
    holiday_date: date
    holiday_name: str

class HolidayMasterCreate(HolidayMasterBase):
    pass

class HolidayMasterResponse(HolidayMasterBase):
    class Config:
        from_attributes = True
