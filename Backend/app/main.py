# pyrefly: ignore [missing-import]
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

# Import the router we just built!
from app.api.production import machines
from app.api.production import products
from app.api.production import jobs
from app.api.production import audit_logs

# Import Database tools
from app.db.session import engine
from app.db.base import Base

# We must import all models here so SQLAlchemy knows about them before creating tables
from app.models.user import User
from app.models.machine import MachineMaster
from app.models.product import BottleMaster, BottleConfiguration
from app.models.job import ProductionJob, JobPackaging
from app.models.audit_log import AuditLog

# Create all database tables (if they don't exist yet)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VitrumGlass Manufacturing API",
    description="Backend for production tracking, yield calculations, and RBAC.",
    version="1.0.0"
)

# 2. Add CORS Middleware to whitelist the Frontend!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to ["http://localhost:3000", "https://your-aws-site.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This plugs the modules into the main application
app.include_router(machines.router)
app.include_router(products.router)
app.include_router(jobs.router)
app.include_router(audit_logs.router)

@app.get("/health")
def health_check():
    """
    AWS Load Balancers will ping this endpoint continuously. 
    """
    return {
        "status": "healthy", 
        "service": "vitrumglass-api",
        "db_url": settings.DATABASE_URL # Removing this in production!
    }
