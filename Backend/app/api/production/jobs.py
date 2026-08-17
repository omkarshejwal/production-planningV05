# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException
# pyrefly: ignore [missing-import]
from sqlalchemy import and_, or_
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from decimal import Decimal
from datetime import timedelta

from app.db.session import get_db
from app.models.job import ProductionJob, JobPackaging
from app.models.machine import MachineMaster
from app.models.product import BottleConfiguration
from app.models.audit_log import AuditLog
from app.schemas.job import ProductionJobResponse, ProductionJobCreate, ExtendJobRequest
from app.api.deps import require_manager_role

router = APIRouter(prefix="/jobs", tags=["Production Jobs"])

@router.get("/", response_model=List[ProductionJobResponse])
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
    query = db.query(ProductionJob).options(selectinload(ProductionJob.packaging))
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
    return query.all()

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
    try:
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
            existing_job.required_bottles = job_in.required_bottles
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
                required_bottles=job_in.required_bottles,
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
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create job: {str(e)}")

@router.post("/extend/", response_model=List[ProductionJobResponse])
def extend_job(
    req: ExtendJobRequest,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role)
):
    """
    Extend a production job by N extra days.

    - A continuation row for the selected job is inserted on each of the next N
      calendar days (same daily production window as the source job).
    - Every subsequent job on the same machine — including jobs that start later
      on the source's own day and jobs on strictly later days — is shifted
      forward by N days so no job is overwritten and the original order is kept.
    - The selected job itself and all other jobs remain unchanged.
    """
    days = max(1, min(int(req.days) if req.days else 1, 10))

    source = db.query(ProductionJob).filter_by(
        plan_date=req.plan_date,
        machine_no=req.machine_no,
        start_time=req.start_time,
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Job not found")

    # Snapshot the source fields now — the session identity map is cleared below.
    # The daily production window comes from the actual job data (estimated
    # completion, falling back to the real completion time for ended jobs),
    # never a hardcoded time.
    src_end = source.estimated_completion or source.completion_time
    src = {
        "bottle_id": source.bottle_id,
        "section": source.section,
        "weight": source.weight,
        "speeds": source.speeds,
        "draw": source.draw,
        "quantity": source.quantity,
        "required_bottles": source.required_bottles,
        "estimated_completion": source.estimated_completion,
        "completion_time": source.completion_time,
        "window_end": src_end,
        "changeover_minutes": source.changeover_minutes,
    }

    # ── 1. Shift every subsequent job on this machine forward by N days ─────────
    # "Subsequent" means any job that comes after the selected job in the
    # machine's production sequence: a job that starts later on the same day OR
    # a job on a strictly later day.
    # Process in descending order so each destination slot is vacated before we
    # write into it (a job may be moving onto the key a later job just vacated).
    subsequent = (
        db.query(ProductionJob)
        .filter(
            ProductionJob.machine_no == req.machine_no,
            or_(
                ProductionJob.plan_date > req.plan_date,
                and_(
                    ProductionJob.plan_date == req.plan_date,
                    ProductionJob.start_time > req.start_time,
                ),
            ),
        )
        .order_by(ProductionJob.plan_date.desc(), ProductionJob.start_time.desc())
        .all()
    )

    for job in subsequent:
        new_plan = job.plan_date + timedelta(days=days)
        new_start = job.start_time + timedelta(days=days)

        db.query(JobPackaging).filter_by(
            plan_date=job.plan_date,
            machine_no=req.machine_no,
            start_time=job.start_time,
        ).update(
            {"plan_date": new_plan, "start_time": new_start},
            synchronize_session=False,
        )
        db.flush()

        db.query(ProductionJob).filter_by(
            plan_date=job.plan_date,
            machine_no=req.machine_no,
            start_time=job.start_time,
        ).update(
            {
                "plan_date": new_plan,
                "start_time": new_start,
                "estimated_completion": (
                    (job.estimated_completion + timedelta(days=days))
                    if job.estimated_completion else None
                ),
                "completion_time": (
                    (job.completion_time + timedelta(days=days))
                    if job.completion_time else None
                ),
            },
            synchronize_session=False,
        )
        db.flush()

    # Drop the stale in-memory copies of the rows that were moved, so inserting
    # a continuation at a vacated (plan_date, start_time) key never collides
    # with an old identity-map entry.
    db.expire_all()
    db.flush()

    # ── 2. Insert a continuation row for the selected job on each of the next N days
    for d in range(1, days + 1):
        new_plan = req.plan_date + timedelta(days=d)
        new_start = req.start_time + timedelta(days=d)

        existing = db.query(ProductionJob).filter_by(
            plan_date=new_plan,
            machine_no=req.machine_no,
            start_time=new_start,
        ).first()
        if existing:
            continue

        db.add(ProductionJob(
            plan_date=new_plan,
            machine_no=req.machine_no,
            start_time=new_start,
            bottle_id=src["bottle_id"],
            section=src["section"],
            weight=src["weight"],
            speeds=src["speeds"],
            draw=src["draw"],
            quantity=src["quantity"],
            required_bottles=src["required_bottles"],
            estimated_completion=(
                (src["window_end"] + timedelta(days=d))
                if src["window_end"] else None
            ),
            completion_time=None,
            changeover_minutes=src["changeover_minutes"],
            status="Planned",
        ))

    db.commit()

    affected = (
        db.query(ProductionJob)
        .options(selectinload(ProductionJob.packaging))
        .filter(
            ProductionJob.machine_no == req.machine_no,
            ProductionJob.plan_date >= req.plan_date,
        )
        .order_by(ProductionJob.plan_date, ProductionJob.start_time)
        .all()
    )
    return affected

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
    All subsequent jobs on the same machine are shifted backward to
    close the gap so the schedule stays continuous.
    """
    existing_job = db.query(ProductionJob).filter_by(
        plan_date=plan_date,
        machine_no=machine_no,
        start_time=start_time
    ).first()

    if not existing_job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Snapshot the deleted job's timing before removal
    deleted_start = existing_job.start_time
    deleted_plan = existing_job.plan_date

    # ── 1. Delete the job to vacate its slot ──────────────────────────────────
    db.query(JobPackaging).filter_by(
        plan_date=plan_date,
        machine_no=machine_no,
        start_time=start_time
    ).delete()
    db.flush()

    db.delete(existing_job)
    db.flush()

    # ── 2. Shift every subsequent job on this machine backward ────────────────
    # Fresh query so we read from the DB state that already excludes the
    # deleted row.
    subsequent = (
        db.query(ProductionJob)
        .filter(
            ProductionJob.machine_no == machine_no,
            or_(
                ProductionJob.plan_date > deleted_plan,
                and_(
                    ProductionJob.plan_date == deleted_plan,
                    ProductionJob.start_time > deleted_start,
                ),
            ),
        )
        .order_by(ProductionJob.plan_date, ProductionJob.start_time)
        .all()
    )

    if subsequent:
        # The gap to close is the time between the deleted job's start
        # and the next job's start.  Shifting every subsequent job backward
        # by this amount makes the first remaining job start exactly where
        # the deleted job used to start.
        delta = subsequent[0].start_time - deleted_start

        for job in subsequent:
            new_start = job.start_time - delta
            new_plan = new_start.date()

            db.query(JobPackaging).filter_by(
                plan_date=job.plan_date,
                machine_no=machine_no,
                start_time=job.start_time,
            ).update(
                {"plan_date": new_plan, "start_time": new_start},
                synchronize_session=False,
            )
            db.flush()

            db.query(ProductionJob).filter_by(
                plan_date=job.plan_date,
                machine_no=machine_no,
                start_time=job.start_time,
            ).update(
                {
                    "plan_date": new_plan,
                    "start_time": new_start,
                    "estimated_completion": (
                        (job.estimated_completion - delta)
                        if job.estimated_completion else None
                    ),
                    "completion_time": (
                        (job.completion_time - delta)
                        if job.completion_time else None
                    ),
                },
                synchronize_session=False,
            )
            db.flush()

    db.commit()
