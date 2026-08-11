from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal

from app.db.session import get_db
from app.models.job import ProductionJob, JobPackaging
from app.models.machine import MachineMaster
from app.models.product import BottleConfiguration
from app.models.audit_log import AuditLog
from app.schemas.job import ProductionJobResponse, ProductionJobCreate
from app.api.deps import require_manager_role

router = APIRouter(prefix="/jobs", tags=["Production Jobs"])

def serialize_job(job: ProductionJob) -> dict:
    return {
        "plan_date": job.plan_date,
        "machine_no": job.machine_no,
        "start_time": job.start_time,
        "bottle_id": job.bottle_id,
        "section": job.section,
        "weight": job.weight,
        "speeds": job.speeds,
        "draw": job.draw,
        "quantity": job.quantity,
        "target_quantity": job.target_quantity,
        "job_group_id": job.job_group_id,
        "estimated_completion": job.estimated_completion,
        "completion_time": job.completion_time,
        "changeover_minutes": job.changeover_minutes,
        "status": job.status,
        "packaging": [
            {
                "packaging_type": pack.packaging_type,
                "quantity": pack.quantity,
                "pallet_packing": pack.pallet_packing,
                "pallet_quantity": pack.pallet_quantity,
            }
            for pack in job.packaging
        ],
    }

@router.get("/")
def get_all_jobs(
    db: Session = Depends(get_db),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    machine_no: Optional[int] = None,
    limit: Optional[int] = None,
    order_by: Optional[str] = None,
):
    """
    Fetch all production jobs.
    """
    query = db.query(ProductionJob)
    if from_date:
        query = query.filter(ProductionJob.plan_date >= from_date)
    if to_date:
        query = query.filter(ProductionJob.plan_date <= to_date)
    if machine_no:
        query = query.filter(ProductionJob.machine_no == machine_no)
    if order_by == "desc":
        query = query.order_by(ProductionJob.plan_date.desc(), ProductionJob.start_time.desc())
    if limit:
        query = query.limit(limit)
    return [serialize_job(job) for job in query.all()]

@router.post("/")
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
    resolved_quantity = job_in.quantity if job_in.quantity and job_in.quantity > 0 else calculated_qty
    resolved_target_quantity = job_in.target_quantity if job_in.target_quantity and job_in.target_quantity > 0 else resolved_quantity

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
        existing_job.quantity = resolved_quantity
        existing_job.target_quantity = resolved_target_quantity
        existing_job.job_group_id = job_in.job_group_id
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
            quantity=resolved_quantity,
            target_quantity=resolved_target_quantity,
            job_group_id=job_in.job_group_id,
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
    return serialize_job(new_job)

@router.delete("/{plan_date}/{machine_no}/{start_time}", status_code=204)
def delete_job(
    plan_date: str,
    machine_no: int,
    start_time: str,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role)
):
    """
    Delete a production job and its associated packaging rows.
    """
    existing_job = db.query(ProductionJob).filter_by(
        plan_date=plan_date,
        machine_no=machine_no,
        start_time=start_time
    ).first()

    if not existing_job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Clear packaging for this job
    db.query(JobPackaging).filter_by(
        plan_date=plan_date,
        machine_no=machine_no,
        start_time=start_time
    ).delete()
    db.flush()  # Force DELETE to execute before job deletion

    # Delete the job
    db.delete(existing_job)
    db.commit()
