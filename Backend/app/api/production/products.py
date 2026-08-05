from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.product import BottleMaster, BottleConfiguration
from app.models.audit_log import AuditLog
from app.schemas.product import (
    BottleMasterResponse, BottleMasterCreate,
    BottleConfigurationResponse, BottleConfigurationCreate
)
from app.api.deps import require_manager_role

router = APIRouter(prefix="/products", tags=["Production Products"])

@router.get("/bottles/", response_model=List[BottleMasterResponse])
def get_all_bottles(db: Session = Depends(get_db)):
    """
    Fetch all base bottles from the master table.
    """
    return db.query(BottleMaster).all()

@router.post("/bottles/", response_model=BottleMasterResponse)
def create_bottle(
    bottle_in: BottleMasterCreate, 
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role)
):
    """
    Add a new base bottle to the database.
    """
    new_bottle = BottleMaster(bottle_name=bottle_in.bottle_name)
    db.add(new_bottle)
    db.commit()
    db.refresh(new_bottle)

    db.add(AuditLog(
        user_id=1, 
        action="CREATED_BOTTLE",
        details=f"User ({user_role}) created Bottle '{new_bottle.bottle_name}' with ID {new_bottle.bottle_id}"
    ))
    db.commit()

    return new_bottle

@router.get("/configurations/", response_model=List[BottleConfigurationResponse])
def get_all_configurations(db: Session = Depends(get_db)):
    """
    Fetch all bottle configurations (speeds/weights mapped to machines).
    """
    return db.query(BottleConfiguration).all()

@router.post("/configurations/", response_model=BottleConfigurationResponse)
def create_configuration(
    config_in: BottleConfigurationCreate, 
    db: Session = Depends(get_db),
    user_role: str = Depends(require_manager_role)
):
    """
    Configure a bottle's speed and weight for a specific machine and section.
    """
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
        user_id=1, 
        action="CONFIGURED_BOTTLE",
        details=f"User ({user_role}) configured Bottle {new_config.bottle_id} on Machine {new_config.machine_no} Section {new_config.section}"
    ))
    db.commit()

    return new_config
