from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime

class JobPackagingCreate(BaseModel):
    packaging_type: str
    quantity: Decimal
    pallet_packing: bool = False
    pallet_quantity: Optional[Decimal] = None

class ProductionJobCreate(BaseModel):
    plan_date: date
    machine_no: int
    start_time: datetime
    bottle_id: int
    section: int
    quantity: Decimal
    target_quantity: Optional[Decimal] = None
    draw: Decimal
    
    estimated_completion: Optional[datetime] = None
    completion_time: Optional[datetime] = None
    changeover_minutes: int = 0
    status: Optional[str] = None
    job_group_id: Optional[str] = None

    packaging: List[JobPackagingCreate] = []

class ProductionJobResponse(BaseModel):
    plan_date: date
    machine_no: int
    start_time: datetime
    bottle_id: int
    section: int
    weight: Decimal
    speeds: Decimal
    draw: Decimal
    quantity: Decimal
    target_quantity: Optional[Decimal] = None
    job_group_id: Optional[str] = None
    estimated_completion: Optional[datetime]
    completion_time: Optional[datetime]
    changeover_minutes: int
    status: str
    packaging: List[JobPackagingCreate] = []

    model_config = ConfigDict(from_attributes=True)
