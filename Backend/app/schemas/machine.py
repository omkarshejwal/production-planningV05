from pydantic import BaseModel

class MachineMasterBase(BaseModel):
    machine_no: int
    gob_type: int
    max_section: int

class MachineMasterCreate(MachineMasterBase):
    pass

class MachineMasterResponse(MachineMasterBase):
    class Config:
        from_attributes = True
