from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.machine import MachineMaster
from app.models.audit_log import AuditLog
from app.schemas.machine import MachineMasterResponse, MachineMasterCreate
from app.api.deps import require_manager_role

router = APIRouter(prefix="/machines", tags=["Production Machines"])

@router.get("/", response_model=List[MachineMasterResponse])
def get_all_machines(db: Session = Depends(get_db)):
    """
    Fetch all machines from the master table.
    """
    machines = db.query(MachineMaster).all()
    return machines

@router.post("/", response_model=MachineMasterResponse)
def create_machine(
    machine_in: MachineMasterCreate, 
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role)
):
    """
    Add a new machine to the database, enforcing factory hardware constraints.
    """
    # 1. Enforce Factory Hardware Logic
    if machine_in.machine_no in [1, 4]:
        if machine_in.gob_type != 3 or machine_in.max_section != 8:
            raise HTTPException(
                status_code=400, 
                detail=f"Machine {machine_in.machine_no} must have exactly 3 gobs and 8 sections."
            )
    elif machine_in.machine_no in [2, 3]:
        if machine_in.gob_type != 2 or machine_in.max_section != 10:
            raise HTTPException(
                status_code=400, 
                detail=f"Machine {machine_in.machine_no} must have exactly 2 gobs and 10 sections."
            )
    else:
        raise HTTPException(status_code=400, detail="Only Machines 1, 2, 3, and 4 are supported in this factory.")

    new_machine = MachineMaster(
        machine_no=machine_in.machine_no,
        gob_type=machine_in.gob_type,
        max_section=machine_in.max_section
    )
    db.add(new_machine)

    # Automatically create an Audit Log
    db.add(AuditLog(
        user_id=1, # Hardcoded to 1 until we build real user login
        action="CREATED_MACHINE",
        details=f"User ({user_role}) created Machine {new_machine.machine_no}"
    ))

    db.commit()
    db.refresh(new_machine)
    return new_machine