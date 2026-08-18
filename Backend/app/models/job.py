# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, Boolean, ForeignKey, UniqueConstraint
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
from app.db.base import Base, production_fk, production_table_args


class ProductionJob(Base):
    __tablename__ = "production_job"

    job_id = Column(Integer, primary_key=True, index=True)
    plan_date = Column(Date, nullable=False)
    machine_no = Column(Integer, nullable=False)
    start_time = Column(DateTime, nullable=False)
    bottle_id = Column(Integer, nullable=False)
    section = Column(Integer, nullable=False)
    weight = Column(Numeric(10, 2), nullable=False)
    speeds = Column(Numeric(10, 2), nullable=False)
    draw = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False)
    required_bottles = Column(Numeric(14, 2), nullable=True)

    estimated_completion = Column(DateTime)
    completion_time = Column(DateTime)
    changeover_minutes = Column(Integer, default=0)
    status = Column(String(20), default="Planned")

    packaging = relationship("JobPackaging", backref="job", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('plan_date', 'machine_no', 'start_time', name='uix_1'),
        production_table_args()
    )


class JobPackaging(Base):
    __tablename__ = "job_packaging"

    job_id = Column(Integer, ForeignKey(production_fk("production_job.job_id")), primary_key=True)
    packaging_type = Column(String(2), primary_key=True)
    plan_date = Column(Date)
    machine_no = Column(Integer)
    bottle_id = Column(Integer)
    section = Column(Integer)
    start_time = Column(DateTime)
    quantity = Column(Numeric(12, 2), nullable=False)
    pallet_packing = Column(Boolean, default=False)
    pallet_quantity = Column(Numeric(12, 2))

    __table_args__ = (production_table_args(),)