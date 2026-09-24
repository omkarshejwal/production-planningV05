# pyrefly: ignore [missing-import]
"""
Read-only SQLAlchemy mappings for the existing ``auth`` schema tables.

These tables are provisioned on the database server (auth.users,
auth.module_master, auth.user_module_permissions) and are the application's
single source of truth for authentication and per-module access control.

CRITICAL: The models below intentionally live on their own ``DeclarativeBase``
(AuthBase) instead of the production ``Base``.  ``Base.metadata`` is passed to
``Base.metadata.create_all()`` on startup, which must NEVER be allowed to create
or alter these auth tables.  ``AuthBase.metadata`` is only used for read-updates
(signup / change-password) and is not part of the automatic table-creation set.
"""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy.orm import DeclarativeBase

from app.db.base import auth_table_args


class AuthBase(DeclarativeBase):
    pass


class AuthUser(AuthBase):
    __tablename__ = "users"
    __table_args__ = auth_table_args()

    employee_id = Column(String, primary_key=True)
    employee_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    password = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ModuleMaster(AuthBase):
    __tablename__ = "module_master"
    __table_args__ = auth_table_args()

    module_id = Column(Integer, primary_key=True)
    module_name = Column(String, nullable=False)
    parent_module_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)


class UserModulePermission(AuthBase):
    __tablename__ = "user_module_permissions"
    __table_args__ = auth_table_args()

    permission_id = Column(Integer, primary_key=True)
    employee_id = Column(String, nullable=False, index=True)
    module_id = Column(Integer, nullable=False, index=True)
    can_read = Column(Boolean, nullable=False, default=False)
    can_edit = Column(Boolean, nullable=False, default=False)