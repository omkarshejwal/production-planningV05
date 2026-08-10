from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, Boolean, ForeignKeyConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base, production_table_args

class ProductionJob(Base):
    __tablename__ = "production_job"

    plan_date = Column(Date, primary_key=True)
    machine_no = Column(Integer, primary_key=True)
    start_time = Column(DateTime, primary_key=True)
    
    bottle_id = Column(Integer, nullable=False)
    section = Column(Integer, nullable=False)
    weight = Column(Numeric(10, 2), nullable=False)
    speeds = Column(Numeric(10, 2), nullable=False)
    draw = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False)
    
    estimated_completion = Column(DateTime)
    completion_time = Column(DateTime)
    changeover_minutes = Column(Integer, default=0)
    status = Column(String(20), default="Planned")
    
    packaging = relationship("JobPackaging", backref="job", cascade="all, delete-orphan",
                             primaryjoin="and_(ProductionJob.plan_date==foreign(JobPackaging.plan_date), "
                                         "ProductionJob.machine_no==foreign(JobPackaging.machine_no), "
                                         "ProductionJob.start_time==foreign(JobPackaging.start_time))")
    
    __table_args__ = production_table_args()

class JobPackaging(Base):
    __tablename__ = "job_packaging"

    plan_date = Column(Date, primary_key=True)
    machine_no = Column(Integer, primary_key=True)
    bottle_id = Column(Integer, primary_key=True)
    section = Column(Integer, primary_key=True)
    start_time = Column(DateTime, primary_key=True)
    packaging_type = Column(String(2), primary_key=True)
    
    quantity = Column(Numeric(12, 2), nullable=False)
    pallet_packing = Column(Boolean, default=False)
    pallet_quantity = Column(Numeric(12, 2))

    __table_args__ = production_table_args()
