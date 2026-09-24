# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List

from app.db.session import get_db
from app.models.quality import DefectMaster
from app.schemas.quality import DefectMasterCreate, DefectMasterUpdate, DefectMasterResponse
from app.api.permissions import require_module_read, require_module_edit, MODULE_QUALITY_CONTROL
from app.models.auth import AuthUser

router = APIRouter()

@router.get("/", response_model=List[DefectMasterResponse])
def list_defects(active_only: bool = False, db: Session = Depends(get_db), _user: AuthUser = Depends(require_module_read(MODULE_QUALITY_CONTROL))):
    query = db.query(DefectMaster)
    if active_only:
        query = query.filter(DefectMaster.is_active == True)
    return query.order_by(DefectMaster.defect_sr).all()

@router.post("/", response_model=DefectMasterResponse)
def create_defect(
    defect: DefectMasterCreate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_module_edit(MODULE_QUALITY_CONTROL))
):
    if defect.defect_type not in ["Critical", "Major", "Minor"]:
        raise HTTPException(status_code=400, detail="defect_type must be Critical, Major, or Minor")
        
    db_defect = DefectMaster(**defect.model_dump())
    db.add(db_defect)
    try:
        db.commit()
        db.refresh(db_defect)
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A defect with this name or (sr, type) already exists."
        )
    return db_defect

@router.put("/{defect_id}", response_model=DefectMasterResponse)
def update_defect(
    defect_id: int,
    defect_update: DefectMasterUpdate,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_module_edit(MODULE_QUALITY_CONTROL))
):
    db_defect = db.query(DefectMaster).filter(DefectMaster.defect_id == defect_id).first()
    if not db_defect:
        raise HTTPException(status_code=404, detail="Defect not found")

    if defect_update.defect_type is not None and defect_update.defect_type not in ["Critical", "Major", "Minor"]:
        raise HTTPException(status_code=400, detail="defect_type must be Critical, Major, or Minor")

    update_data = defect_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_defect, key, value)
        
    try:
        db.commit()
        db.refresh(db_defect)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A defect with this name or (sr, type) already exists."
        )
    return db_defect