import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User


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


def user_response(user: User) -> dict[str, str]:
    return {
        "employee_id": user.employee_id,
        "employee_name": user.employee_name,
        "department": user.department,
        "email": user.email,
        "phone_number": user.phone_number,
        "role": user.role,
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
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

    user = db.get(User, session[0])

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive",
        )

    return user


@router.post("/login")
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    user_id = payload.user_id.strip()

    user = (
        db.query(User)
        .filter(
            or_(
                User.email == user_id.lower(),
                User.phone_number == user_id,
            )
        )
        .first()
    )

    # Plain-text password comparison
    if (
        not user
        or not user.is_active
        or payload.password != user.password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID or password",
        )

    token = secrets.token_urlsafe(32)

    SESSIONS[token] = (
        user.employee_id,
        datetime.now(timezone.utc) + SESSION_LIFETIME,
    )

    return {
        "token": token,
        "user": user_response(user),
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

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this email address",
        )

    if db.get(User, payload.employee_id.strip()):
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this employee ID",
        )

    user = User(
        employee_id=payload.employee_id.strip(),
        employee_name=payload.employee_name.strip(),
        department=payload.department.strip(),
        email=email,
        phone_number=payload.phone_number.strip(),

        # Store normal password without hashing
        password=payload.password,

        role=payload.role,
        is_active=True,
    )

    db.add(user)
    db.commit()

    return {
        "message": "Account created successfully"
    }


@router.get("/me")
def get_me(
    user: User = Depends(get_current_user),
):
    return user_response(user)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
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