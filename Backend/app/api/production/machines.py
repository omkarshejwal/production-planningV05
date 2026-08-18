from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.machine import MachineMaster
from app.models.audit_log import AuditLog
from app.schemas.machine import MachineMasterResponse, MachineMasterCreate
from app.api.deps import require_manager_role
from app.api.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/machines", tags=["Production Machines"])

@router.get("/", response_model=List[MachineMasterResponse])
def get_all_machines(db: Session = Depends(get_db)):
    machines = db.query(MachineMaster).all()
    return machines

@router.post("/", response_model=MachineMasterResponse)
def create_machine(
    machine_in: MachineMasterCreate,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
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

    db.add(AuditLog(
        user_id=current_user.employee_id,
        action="CREATED_MACHINE",
        details=f"User ({user_role}) created Machine {new_machine.machine_no}"
    ))

    db.commit()
    db.refresh(new_machine)
    return new_machine

@router.put("/{machine_no}", response_model=MachineMasterResponse)
def update_machine(
    machine_no: int,
    machine_in: MachineMasterCreate,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(MachineMaster).filter(MachineMaster.machine_no == machine_no).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Machine not found.")

    if machine_no in [1, 4]:
        if machine_in.gob_type != 3 or machine_in.max_section != 8:
            raise HTTPException(
                status_code=400,
                detail=f"Machine {machine_no} must have exactly 3 gobs and 8 sections."
            )
    elif machine_no in [2, 3]:
        if machine_in.gob_type != 2 or machine_in.max_section != 10:
            raise HTTPException(
                status_code=400,
                detail=f"Machine {machine_no} must have exactly 2 gobs and 10 sections."
            )

    existing.gob_type = machine_in.gob_type
    existing.max_section = machine_in.max_section

    db.add(AuditLog(
        user_id=current_user.employee_id,
        action="UPDATED_MACHINE",
        details=f"User ({user_role}) updated Machine {machine_no}"
    ))

    db.commit()
    db.refresh(existing)
    return existing
