import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.access import load_access
from app.db.session import get_db
from app.models.auth import AuthUser
from app.models.user import User as ProductionUser


router = APIRouter(prefix="/api/auth", tags=["Authentication"])

security = HTTPBearer(auto_error=False)

SESSIONS: dict[str, tuple[str, datetime]] = {}

SESSION_LIFETIME = timedelta(hours=8)


class LoginRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)


class SignupRequest(BaseModel):
    employee_id: str = Field(min_length=1, max_length=100)
    employee_name: str = Field(min_length=1, max_length=255)
    department: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    phone_number: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=1024)
    role: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()

        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise ValueError("A valid email address is required")

        return email


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=8, max_length=1024)


def user_response(user: AuthUser, db: Session) -> dict:
    # Employee self-service display fields (profile/header) come from the
    # legacy production.users table when available; auth.users is authoritative
    # for login and permissions. Missing legacy rows fall back safely.
    legacy = db.get(ProductionUser, user.employee_id)
    access = load_access(user.employee_id, db)

    return {
        "employee_id": user.employee_id,
        "employee_name": user.employee_name,
        "department": legacy.department if legacy else "",
        "email": user.email or "",
        "phone_number": user.phone_number or "",
        "role": legacy.role if legacy else "Viewer",
        # Dynamic module catalog (auth.module_master) + effective permissions
        # (auth.user_module_permissions) -- both read fresh from the database.
        "modules": access["modules"],
        "permissions": access["permissions"],
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> AuthUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    session = SESSIONS.get(credentials.credentials)

    if not session or session[1] <= datetime.now(timezone.utc):
        SESSIONS.pop(credentials.credentials, None)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired",
        )

    user = db.get(AuthUser, session[0])

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive",
        )

    return user


@router.get("/permissions")
def get_permissions(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cheap re-read of the module catalog and the caller's permissions.

    The frontend polls this so permission changes made in the database are
    picked up without a redeploy, a rebuild, or a re-login.  Authoritative
    enforcement still happens on every backend request via
    ``require_module_read`` / ``require_module_edit``.
    """
    return load_access(user.employee_id, db)


@router.post("/login")
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    # Auth is driven by the auth.users table: employee_id is the login ID.
    user = db.query(AuthUser).filter(
        AuthUser.employee_id == payload.user_id.strip()
    ).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid employee ID or password",
        )

    # auth.users.password is nullable; the initial password for every employee
    # is their registered mobile number (stored in plain text).
    if user.password is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No password is set for this account. Your initial password is your registered mobile number.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account is inactive. Please contact your administrator.",
        )

    # Passwords are stored as plain text in auth.users, so compare directly.
    if payload.password != user.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid employee ID or password",
        )

    token = secrets.token_urlsafe(32)

    SESSIONS[token] = (
        user.employee_id,
        datetime.now(timezone.utc) + SESSION_LIFETIME,
    )

    return {
        "token": token,
        "user": user_response(user, db),
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    db: Session = Depends(get_db),
):
    if payload.role not in {"Editor", "Viewer"}:
        raise HTTPException(
            status_code=422,
            detail="Role must be Editor or Viewer",
        )

    email = payload.email

    if db.query(ProductionUser).filter(ProductionUser.email == email).first():
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this email address",
        )

    if db.get(ProductionUser, payload.employee_id.strip()):
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this employee ID",
        )

    if db.get(AuthUser, payload.employee_id.strip()):
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this employee ID",
        )

    # Auth source of truth: auth.users (password authorizes /api/auth/login).
    db.add(AuthUser(
        employee_id=payload.employee_id.strip(),
        employee_name=payload.employee_name.strip(),
        email=email,
        phone_number=payload.phone_number.strip(),
        password=payload.password,
        is_active=True,
    ))

    # Legacy production.users row retains the display-only department/role.
    db.add(ProductionUser(
        employee_id=payload.employee_id.strip(),
        employee_name=payload.employee_name.strip(),
        department=payload.department.strip(),
        email=email,
        phone_number=payload.phone_number.strip(),
        password=payload.password,
        role=payload.role,
        is_active=True,
    ))

    db.commit()

    return {
        "message": "Account created successfully"
    }


@router.get("/me")
def get_me(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return user_response(user, db)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Plain-text password comparison
    if payload.current_password != user.password:
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    # Store new password without hashing
    user.password = payload.new_password

    legacy = db.get(ProductionUser, user.employee_id)
    if legacy:
        legacy.password = payload.new_password

    db.commit()

    return {
        "message": "Password updated successfully"
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    if credentials:
        SESSIONS.pop(credentials.credentials, None)
