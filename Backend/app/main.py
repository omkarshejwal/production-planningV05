# pyrefly: ignore [missing-import]
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings

# Import the router we just built!
from app.api.production import machines
from app.api.production import products
from app.api.production import jobs
from app.api.production import audit_logs
from app.api.production import holidays
from app.api import auth
from app.api.auth import get_current_user

# Import Database tools
from app.db.session import engine
from app.db.base import Base

# We must import all models here so SQLAlchemy knows about them before creating tables
from app.models.user import User
from app.models.machine import MachineMaster
from app.models.product import BottleMaster, BottleConfiguration
from app.models.job import ProductionJob, JobPackaging
from app.models.audit_log import AuditLog
from app.models.holiday import HolidayMaster

def initialize_database() -> None:
    if settings.production_schema:
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.production_schema}"'))
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VitrumGlass Manufacturing API",
    description="Backend for production tracking, yield calculations, and RBAC.",
    version="1.0.0"
)

# 2. Add CORS Middleware to whitelist the Frontend!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, change this to your specific domain
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This plugs the modules into the main application with the correct /api/production prefix
app.include_router(machines.router, prefix="/api/production", dependencies=[Depends(get_current_user)])
app.include_router(products.router, prefix="/api/production", dependencies=[Depends(get_current_user)])
app.include_router(jobs.router, prefix="/api/production", dependencies=[Depends(get_current_user)])
app.include_router(audit_logs.router, prefix="/api/production", dependencies=[Depends(get_current_user)])
app.include_router(holidays.router, prefix="/api/production", dependencies=[Depends(get_current_user)])
app.include_router(auth.router)


@app.on_event("startup")
def on_startup() -> None:
    initialize_database()

@app.get("/health")
def health_check():
    """
    AWS Load Balancers will ping this endpoint continuously. 
    """
    return {
        "status": "healthy", 
        "service": "vitrumglass-api",
        "db_url": settings.DATABASE_URL  # Removing this in production!
    }
