from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from app.db.session import get_db
from app.models.job import ProductionJob, JobPackaging
from app.models.machine import MachineMaster
from app.models.product import BottleConfiguration
from app.models.audit_log import AuditLog
from app.schemas.job import ProductionJobResponse, ProductionJobCreate
from app.api.deps import require_manager_role

router = APIRouter(prefix="/jobs", tags=["Production Jobs"])

@router.get("/", response_model=List[ProductionJobResponse])
def get_all_jobs(db: Session = Depends(get_db)):
    """
    Fetch all production jobs.
    """
    return db.query(ProductionJob).all()

@router.post("/", response_model=ProductionJobResponse)
def create_job(
    job_in: ProductionJobCreate, 
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role)
):
    """
    Add a new job. The Backend Calculation Engine automatically computes Quantity and Tonnage.
    """
    # 1. Fetch Machine and Bottle Configuration from the DB
    machine = db.query(MachineMaster).filter(MachineMaster.machine_no == job_in.machine_no).first()
    bottle_config = db.query(BottleConfiguration).filter(
        BottleConfiguration.machine_no == job_in.machine_no,
        BottleConfiguration.bottle_id == job_in.bottle_id,
        BottleConfiguration.section == job_in.section
    ).first()

    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    if not bottle_config:
        raise HTTPException(status_code=404, detail="Bottle configuration not found for this machine/section")

    # 2. Execute Factory Formula (The Calculation Engine)
    running_minutes = 1440 - job_in.changeover_minutes
    speed = bottle_config.speeds 
    calculated_qty = speed * machine.gob_type * running_minutes

    # 3. Create the Job
    new_job = ProductionJob(
        plan_date=job_in.plan_date,
        machine_no=job_in.machine_no,
        start_time=job_in.start_time,
        bottle_id=job_in.bottle_id,
        section=job_in.section,
        weight=bottle_config.weight, # Automatically pulled from DB Configuration!
        speeds=speed,                # Automatically pulled from DB Configuration!
        draw=job_in.draw,
        quantity=calculated_qty,     # Automatically Calculated!
        estimated_completion=job_in.estimated_completion,
        changeover_minutes=job_in.changeover_minutes
    )
    db.add(new_job)

    # 4. Handle Packaging (if provided)
    for pack in job_in.packaging:
        db.add(JobPackaging(
            plan_date=job_in.plan_date,
            machine_no=job_in.machine_no,
            bottle_id=job_in.bottle_id,
            section=job_in.section,
            start_time=job_in.start_time,
            packaging_type=pack.packaging_type,
            quantity=pack.quantity,
            pallet_packing=pack.pallet_packing,
            pallet_quantity=pack.pallet_quantity
        ))

    # Automatically create an Audit Log
    db.add(AuditLog(
        user_id=1, 
        action="CREATED_JOB",
        details=f"User ({user_role}) created Job for Bottle ID {job_in.bottle_id} on Machine {job_in.machine_no} with Calculated Qty {calculated_qty}"
    ))

    db.commit()
    db.refresh(new_job)
    return new_job
