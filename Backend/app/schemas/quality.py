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
    # entry_id / report_id are echoed back by the client for convenience only —
    # the backend identifies rows by (machine_no, production_time) and takes the
    # report from production_date. They are optional so a row the frontend
    # invented locally (blank slot, "+" copy) never fails validation with a 422
    # that would abort the whole save.
    entry_id: Optional[Union[int, str]] = None
    report_id: Optional[Union[int, str]] = None
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
    packing_size: Optional[int] = None
    cartons: Optional[int] = None
    bottles_in_nos: Optional[int] = None
    efficiency_percentage: Optional[float] = None
    sqc: Optional[int] = None
    qc_hold: Optional[int] = None
    num: Optional[int] = None
    remarks: Optional[str] = None
    defect_ids: List[str] = []
    job_id: Optional[str] = None

    @field_validator(
        "bottle_id",
        "section",
        "packing_size",
        "cartons",
        "bottles_in_nos",
        "sqc",
        "qc_hold",
        "num",
        mode="before",
    )
    @classmethod
    def _whole_number(cls, value):
        """Coerce integer columns before validation.

        The grid uses free numeric inputs, so a keystroke like "12.5" arrives as
        a fractional float. Rejecting it with a 422 would abort the WHOLE day's
        save (every row is one request), so whole-number columns are truncated
        here instead. Genuinely non-numeric input is still reported as a
        validation error rather than being silently stored.
        """
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ValueError("must be a whole number")
        if number != number or number in (float("inf"), float("-inf")):
            raise ValueError("must be a whole number")
        return int(number)

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
    continuation: Optional[Dict[str, Dict[str, QualityHourlyEntrySchema]]] = None

class QualityJobRowSchema(BaseModel):
    """One machine + Job ID row of the job-wise production summary.

    job_start_time / job_end_time carry the PRODUCTION date together with the
    job's start/end clock time: a slot between 12:00 AM and 8:59 AM belongs to
    the previous production date, so its date part is that production date,
    never the next calendar day.
    """
    machine_no: int
    job_id: str
    bottle_id: Optional[int] = None
    job_start_time: datetime
    job_end_time: Optional[datetime] = None
    status: str = ""
    remarks: Optional[str] = None
    production_units: int = 0

