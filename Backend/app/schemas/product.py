from pydantic import BaseModel
from decimal import Decimal

class BottleMasterBase(BaseModel):
    bottle_name: str

class BottleMasterCreate(BottleMasterBase):
    pass

class BottleMasterResponse(BottleMasterBase):
    bottle_id: int
    class Config:
        from_attributes = True

class BottleConfigurationBase(BaseModel):
    machine_no: int
    bottle_id: int
    section: int
    weight: Decimal
    speeds: Decimal

class BottleConfigurationCreate(BottleConfigurationBase):
    pass

class BottleConfigurationResponse(BottleConfigurationBase):
    class Config:
        from_attributes = True
