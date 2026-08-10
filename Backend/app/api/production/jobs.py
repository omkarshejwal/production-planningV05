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
    Supports upsert: if a job with the same date/machine/start_time exists, it will be updated.
    """
    # 1. Fetch Machine and Bottle Configuration from the DB
    machine = db.query(MachineMaster).filter(MachineMaster.machine_no == job_in.machine_no).first()
    bottle_config = db.query(BottleConfiguration).filter(
        BottleConfiguration.machine_no == job_in.machine_no,
        BottleConfiguration.bottle_id == job_in.bottle_id,
        BottleConfiguration.section == job_in.section
    ).first()

    if not bottle_config:
        # Fallback: try to find ANY section configuration for this machine/bottle
        bottle_config = db.query(BottleConfiguration).filter(
            BottleConfiguration.machine_no == job_in.machine_no,
            BottleConfiguration.bottle_id == job_in.bottle_id
        ).first()

    if not bottle_config:
        # Ultimate Fallback: try to find ANY machine's configuration for this bottle
        bottle_config = db.query(BottleConfiguration).filter(
            BottleConfiguration.bottle_id == job_in.bottle_id
        ).first()
        
    if not bottle_config:
        raise HTTPException(status_code=404, detail=f"Bottle configuration not found for Machine {job_in.machine_no} and Bottle ID {job_in.bottle_id}")

    # Use the resolved section from the config to ensure foreign keys match
    resolved_section = bottle_config.section

    # 2. Execute Factory Formula (The Calculation Engine)
    running_minutes = 1440 - job_in.changeover_minutes
    speed = bottle_config.speeds
    gob = machine.gob_type if machine else (3 if job_in.machine_no in (1, 4) else 2)
    calculated_qty = speed * gob * running_minutes
    calculated_draw = (calculated_qty * bottle_config.weight) / Decimal("1000000")

    # 3. Create or Update the Job (Upsert)
    existing_job = db.query(ProductionJob).filter_by(
        plan_date=job_in.plan_date,
        machine_no=job_in.machine_no,
        start_time=job_in.start_time
    ).first()

    if existing_job:
        existing_job.bottle_id = job_in.bottle_id
        existing_job.section = resolved_section
        existing_job.weight = bottle_config.weight
        existing_job.speeds = speed
        existing_job.draw = job_in.draw if job_in.draw else calculated_draw
        existing_job.quantity = calculated_qty
        existing_job.estimated_completion = job_in.estimated_completion
        existing_job.completion_time = job_in.completion_time
        existing_job.changeover_minutes = job_in.changeover_minutes
        if job_in.status:
            existing_job.status = job_in.status
        
        # Clear old packaging for this job
        db.query(JobPackaging).filter_by(
            plan_date=job_in.plan_date,
            machine_no=job_in.machine_no,
            start_time=job_in.start_time
        ).delete()
        db.flush()  # Force DELETE to execute before INSERTS
        new_job = existing_job
    else:
        new_job = ProductionJob(
            plan_date=job_in.plan_date,
            machine_no=job_in.machine_no,
            start_time=job_in.start_time,
            bottle_id=job_in.bottle_id,
            section=resolved_section,
            weight=bottle_config.weight,
            speeds=speed,
            draw=job_in.draw if job_in.draw else calculated_draw,
            quantity=calculated_qty,
            estimated_completion=job_in.estimated_completion,
            completion_time=job_in.completion_time,
            changeover_minutes=job_in.changeover_minutes,
            status=job_in.status or "Planned"
        )
        db.add(new_job)

    # 4. Handle Packaging (if provided)
    for pack in job_in.packaging:
        db.add(JobPackaging(
            plan_date=job_in.plan_date,
            machine_no=job_in.machine_no,
            bottle_id=job_in.bottle_id,
            section=resolved_section,
            start_time=job_in.start_time,
            packaging_type=pack.packaging_type,
            quantity=pack.quantity,
            pallet_packing=pack.pallet_packing,
            pallet_quantity=pack.pallet_quantity
        ))

    db.commit()
    db.refresh(new_job)
    return new_job
