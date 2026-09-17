# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, SmallInteger, BigInteger, String, Numeric, Date, Time, DateTime, Boolean, ForeignKey, UniqueConstraint, Text, func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
from app.db.base import Base, hpr_fk, hpr_table_args, production_fk

class DefectMaster(Base):
    __tablename__ = "defect_master"

    defect_id = Column(BigInteger, primary_key=True, index=True)
    defect_type = Column(String(50), nullable=False)
    defect_sr = Column(Integer, nullable=False)
    defect_name = Column(String(150), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint('defect_sr', 'defect_type', name='uq_defect_type_sr'),
        hpr_table_args()
    )


class HourlyProductionReport(Base):
    __tablename__ = "hourly_production_report"

    report_id = Column(BigInteger, primary_key=True, index=True)
    production_date = Column(Date, nullable=False, unique=True)

    __table_args__ = (hpr_table_args(),)


class ShiftMaster(Base):
    __tablename__ = "shift_master"

    shift_id = Column(SmallInteger, primary_key=True, index=True)
    shift_name = Column(String(50), nullable=False, unique=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    __table_args__ = (hpr_table_args(),)


class ShiftAssignment(Base):
    __tablename__ = "shift_assignment"

    assignment_id = Column(BigInteger, primary_key=True, index=True)
    report_id = Column(BigInteger, ForeignKey(hpr_fk("hourly_production_report.report_id")), nullable=False)
    shift_id = Column(SmallInteger, ForeignKey(hpr_fk("shift_master.shift_id")), nullable=False)
    supervisor = Column(String(100), nullable=True)
    executive = Column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint('report_id', 'shift_id', name='uq_report_shift'),
        hpr_table_args()
    )


class HourlyProduction(Base):
    __tablename__ = "hourly_production"

    entry_id = Column(BigInteger, primary_key=True, index=True)
    report_id = Column(BigInteger, ForeignKey(hpr_fk("hourly_production_report.report_id")), nullable=False)
    machine_no = Column(Integer, ForeignKey(production_fk("machine_master.machine_no")), nullable=False)
    shift_id = Column(SmallInteger, ForeignKey(hpr_fk("shift_master.shift_id")), nullable=False)
    production_time = Column(DateTime, nullable=False)
    
    bottle_id = Column(Integer, ForeignKey(production_fk("bottle_master.bottle_id")), nullable=True)
    section = Column(Integer, nullable=True)
    
    weight_front = Column(Numeric(10, 2), nullable=True)
    weight_middle = Column(Numeric(10, 2), nullable=True)
    weight_rear = Column(Numeric(10, 2), nullable=True)
    weight_avg = Column(Numeric(10, 2), nullable=True)
    speed_per_min = Column(Numeric(10, 2), nullable=True)
    
    packing_category = Column(String(255), nullable=True)
    packing_size = Column(Integer, nullable=True)
    cartons = Column(Integer, nullable=True)
    bottles_in_nos = Column(Integer, nullable=True)
    efficiency_percent = Column(Numeric(5, 2), nullable=True)
    
    sqc = Column(Integer, nullable=True)
    qc_hold = Column(Integer, nullable=True)
    num = Column(Integer, nullable=True)
    remarks = Column(Text, nullable=True)
    job_id = Column(String(20), nullable=True)

    defects = relationship("DefectMaster", secondary=lambda: HourlyProductionDefect.__table__, lazy="selectin")

    __table_args__ = (
        UniqueConstraint('production_time', 'machine_no', 'report_id', name='uq_hpr_machine_hour'),
        hpr_table_args()
    )


class HourlyProductionDefect(Base):
    __tablename__ = "hourly_production_defect"

    entry_id = Column(BigInteger, ForeignKey(hpr_fk("hourly_production.entry_id")), primary_key=True)
    defect_id = Column(BigInteger, ForeignKey(hpr_fk("defect_master.defect_id")), primary_key=True)

    __table_args__ = (hpr_table_args(),)


class HprJob(Base):
    __tablename__ = "hpr_job"

    job_id = Column(String(20), primary_key=True, index=True)
    machine_no = Column(Integer, nullable=False)
    bottle_id = Column(Integer, nullable=False)
    job_start_time = Column(DateTime, nullable=False)
    job_end_time = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = hpr_table_args()

