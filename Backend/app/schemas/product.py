from pydantic import BaseModel
from decimal import Decimal
from typing import List

class BottleMasterBase(BaseModel):
    bottle_name: str
    # Optional so a rename (PUT) that only sends bottle_name leaves the stored
    # weight untouched, and so legacy bottles saved before bottle_master.weight
    # existed still round-trip as None.
    weight: Decimal | None = None

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

class BottleConfigurationBulkRequest(BaseModel):
    configurations: List[BottleConfigurationCreate]

class BottleConfigurationResponse(BottleConfigurationBase):
    class Config:
        from_attributes = True
