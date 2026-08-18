from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime

class JobPackagingCreate(BaseModel):
    packaging_type: str
    quantity: Optional[Decimal] = Decimal("0")
    pallet_packing: Optional[bool] = False
    pallet_quantity: Optional[Decimal] = None

class ProductionJobCreate(BaseModel):
    plan_date: date
    machine_no: int
    start_time: datetime
    bottle_id: int
    section: Optional[int] = None

    draw: Optional[Decimal] = Decimal("0")

    required_bottles: Optional[Decimal] = Decimal("0")

    estimated_completion: Optional[datetime] = None
    completion_time: Optional[datetime] = None
    changeover_minutes: Optional[int] = 0
    status: Optional[str] = "Planned"

    packaging: List[JobPackagingCreate] = []

class ExtendJobRequest(BaseModel):
    plan_date: date
    machine_no: int
    start_time: datetime
    days: int = 1

class ProductionJobResponse(BaseModel):
    job_id: int
    plan_date: date
    machine_no: int
    start_time: datetime
    bottle_id: int
    section: int
    weight: Decimal
    speeds: Decimal
    draw: Decimal
    quantity: Decimal
    required_bottles: Optional[Decimal] = None
    estimated_completion: Optional[datetime] = None
    completion_time: Optional[datetime] = None
    changeover_minutes: Optional[int] = 0
    status: Optional[str] = "Planned"
    packaging: List[JobPackagingCreate] = []

    class Config:
        from_attributes = True