# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Union
from datetime import date, time, datetime

# --- Defect Master Schemas ---

class DefectMasterBase(BaseModel):
    defect_type: str = Field(..., description="Critical, Major, or Minor")
    defect_sr: int
    defect_name: str
    is_active: bool = True

class DefectMasterCreate(DefectMasterBase):
    pass

class DefectMasterUpdate(BaseModel):
    defect_type: Optional[str] = None
    defect_sr: Optional[int] = None
    defect_name: Optional[str] = None
    is_active: Optional[bool] = None

class DefectMasterResponse(DefectMasterBase):
    defect_id: int

    class Config:
        from_attributes = True

# --- Quality Daily Aggregate Schemas ---

class QualityHourlyEntrySchema(BaseModel):
    entry_id: str
    report_id: str
    machine_no: int
    shift_id: int
    production_time: str
    bottle_id: Optional[int] = None
    section: Optional[int] = None
    weight_front: Optional[float] = None
    weight_middle: Optional[float] = None
    weight_rear: Optional[float] = None
    weight_avg: Optional[float] = None
    speed_per_min: Optional[float] = None
    packing_category: Union[List[str], str, None] = None
    packing_size: Optional[str] = None
    cartons: Optional[int] = None
    bottles_in_nos: Optional[int] = None
    efficiency_percentage: Optional[float] = None
    sqc: Optional[str] = None
    qc_hold: Optional[int] = None
    num: Optional[int] = None
    remarks: Optional[str] = None
    defect_ids: List[str] = []
    job_id: Optional[str] = None

    @field_validator('sqc', 'packing_size', mode='before')
    @classmethod
    def coerce_to_str(cls, v):
        if v is not None:
            return str(v)
        return v

class QualityShiftAssignmentSchema(BaseModel):
    supervisor: str
    executive: str

class QualityDailyRequest(BaseModel):
    production_date: str
    hourly: Dict[str, Dict[str, QualityHourlyEntrySchema]]
    shift_assignments: Dict[str, QualityShiftAssignmentSchema]

class QualityDailyResponse(BaseModel):
    hourly: Dict[str, Dict[str, QualityHourlyEntrySchema]]
    shift_assignments: Dict[str, QualityShiftAssignmentSchema]

