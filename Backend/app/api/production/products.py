from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from typing import List

from app.db.session import get_db
from app.models.product import BottleMaster, BottleConfiguration
from app.models.audit_log import AuditLog
from app.schemas.product import (
    BottleMasterResponse, BottleMasterCreate,
    BottleConfigurationResponse, BottleConfigurationCreate,
    BottleConfigurationBulkRequest
)
from app.api.deps import require_manager_role
from app.api.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/products", tags=["Production Products"])

@router.get("/bottles/", response_model=List[BottleMasterResponse])
def get_all_bottles(db: Session = Depends(get_db)):
    return db.query(BottleMaster).all()

@router.post("/bottles/", response_model=BottleMasterResponse)
def create_bottle(
    bottle_in: BottleMasterCreate,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
    new_bottle = BottleMaster(bottle_name=bottle_in.bottle_name)
    db.add(new_bottle)
    db.commit()
    db.refresh(new_bottle)

    db.add(AuditLog(
        user_id=current_user.employee_id,
        action="CREATED_BOTTLE",
        details=f"User ({user_role}) created Bottle '{new_bottle.bottle_name}' with ID {new_bottle.bottle_id}"
    ))
    db.commit()

    return new_bottle

@router.put("/bottles/{bottle_id}", response_model=BottleMasterResponse)
def update_bottle(
    bottle_id: int,
    bottle_in: BottleMasterCreate,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(BottleMaster).filter(BottleMaster.bottle_id == bottle_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Bottle not found.")

    existing.bottle_name = bottle_in.bottle_name

    db.add(AuditLog(
        user_id=current_user.employee_id,
        action="UPDATED_BOTTLE",
        details=f"User ({user_role}) updated Bottle {bottle_id} to '{bottle_in.bottle_name}'"
    ))
    db.commit()
    db.refresh(existing)
    return existing

@router.get("/configurations/", response_model=List[BottleConfigurationResponse])
def get_all_configurations(db: Session = Depends(get_db)):
    return db.query(BottleConfiguration).all()

@router.post("/configurations/", response_model=BottleConfigurationResponse)
def create_configuration(
    config_in: BottleConfigurationCreate,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(BottleConfiguration).filter(
        BottleConfiguration.machine_no == config_in.machine_no,
        BottleConfiguration.bottle_id == config_in.bottle_id,
        BottleConfiguration.section == config_in.section,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Configuration already exists for Machine {config_in.machine_no}, Bottle {config_in.bottle_id}, Section {config_in.section}."
        )

    new_config = BottleConfiguration(
        machine_no=config_in.machine_no,
        bottle_id=config_in.bottle_id,
        section=config_in.section,
        weight=config_in.weight,
        speeds=config_in.speeds
    )
    db.add(new_config)
    db.commit()
    db.refresh(new_config)

    db.add(AuditLog(
        user_id=current_user.employee_id,
        action="CONFIGURED_BOTTLE",
        details=f"User ({user_role}) configured Bottle {new_config.bottle_id} on Machine {new_config.machine_no} Section {new_config.section}"
    ))
    db.commit()

    return new_config

@router.put("/configurations/{machine_no}/{bottle_id}/{section}", response_model=BottleConfigurationResponse)
def update_configuration(
    machine_no: int,
    bottle_id: int,
    section: int,
    config_in: BottleConfigurationCreate,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(BottleConfiguration).filter(
        BottleConfiguration.machine_no == machine_no,
        BottleConfiguration.bottle_id == bottle_id,
        BottleConfiguration.section == section,
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Bottle configuration not found.")

    existing.weight = config_in.weight
    existing.speeds = config_in.speeds

    db.add(AuditLog(
        user_id=current_user.employee_id,
        action="UPDATED_BOTTLE_CONFIG",
        details=f"User ({user_role}) updated config for Bottle {bottle_id} on Machine {machine_no} Section {section}"
    ))
    db.commit()
    db.refresh(existing)
    return existing

@router.delete("/configurations/{machine_no}/{bottle_id}/{section}")
def delete_configuration(
    machine_no: int,
    bottle_id: int,
    section: int,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(BottleConfiguration).filter(
        BottleConfiguration.machine_no == machine_no,
        BottleConfiguration.bottle_id == bottle_id,
        BottleConfiguration.section == section,
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Bottle configuration not found.")

    db.delete(existing)
    db.add(AuditLog(
        user_id=current_user.employee_id,
        action="DELETED_BOTTLE_CONFIG",
        details=f"User ({user_role}) deleted config for Bottle {bottle_id} on Machine {machine_no} Section {section}"
    ))
    db.commit()
    return {"ok": True}

@router.post("/configurations/bulk/")
def bulk_upsert_configurations(
    payload: BottleConfigurationBulkRequest,
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role),
    current_user: User = Depends(get_current_user),
):
    """Upserts many bottle configurations atomically in a single transaction.

    Mimics the existing per-row create/update behavior: rows that already exist
    (machine_no, bottle_id, section) are updated with the same audit action as
    update_configuration; new rows are inserted with the CONFIGURED_BOTTLE action.
    The whole batch commits or rolls back together.
    """
    configs = payload.configurations
    if not configs:
        return {"ok": True, "saved": 0}

    existing_keys = set(
        (r.machine_no, r.bottle_id, r.section)
        for r in db.query(
            BottleConfiguration.machine_no,
            BottleConfiguration.bottle_id,
            BottleConfiguration.section,
        )
        .filter(
            or_(
                *[
                    and_(
                        BottleConfiguration.machine_no == c.machine_no,
                        BottleConfiguration.bottle_id == c.bottle_id,
                        BottleConfiguration.section == c.section,
                    )
                    for c in configs
                ]
            )
        )
        .all()
    )

    table = BottleConfiguration.__table__
    dialect = db.get_bind().dialect.name
    insert_stmt = (pg_insert if dialect.startswith("postgresql") else sqlite_insert)(table)
    upsert_stmt = insert_stmt.on_conflict_do_update(
        index_elements=[table.c.machine_no, table.c.bottle_id, table.c.section],
        set_={
            "weight": insert_stmt.excluded.weight,
            "speeds": insert_stmt.excluded.speeds,
        },
    )

    try:
        db.execute(
            upsert_stmt,
            [
                {
                    "machine_no": c.machine_no,
                    "bottle_id": c.bottle_id,
                    "section": c.section,
                    "weight": c.weight,
                    "speeds": c.speeds,
                }
                for c in configs
            ],
        )

        for c in configs:
            is_update = (c.machine_no, c.bottle_id, c.section) in existing_keys
            db.add(AuditLog(
                user_id=current_user.employee_id,
                action="UPDATED_BOTTLE_CONFIG" if is_update else "CONFIGURED_BOTTLE",
                details=(
                    f"User ({user_role}) updated config for Bottle {c.bottle_id} on Machine {c.machine_no} Section {c.section}"
                    if is_update
                    else f"User ({user_role}) configured Bottle {c.bottle_id} on Machine {c.machine_no} Section {c.section}"
                ),
            ))
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to bulk save bottle configurations.")

    return {"ok": True, "saved": len(configs)}
