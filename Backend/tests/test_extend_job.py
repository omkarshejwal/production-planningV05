import os

# Force a local temp SQLite DB BEFORE any app module imports the real engine.
_TMP_DB = "./test_extend_job.db"
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

from datetime import date, datetime
from decimal import Decimal

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.job import JobMaster, ProductionJob, JobPackaging, MachineJobSequence, generate_next_job_id
from app.models.machine import MachineMaster
from app.models.product import BottleMaster, BottleConfiguration
from app.api.production.jobs import extend_job
from app.schemas.job import ExtendJobRequest


def setup_module():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.add(MachineMaster(machine_no=1, gob_type=3, max_section=8))
        db.add(BottleMaster(bottle_id=111, bottle_name="Test Bottle"))
        db.add(BottleConfiguration(
            machine_no=1, bottle_id=111, section=8, weight=Decimal("200.00"), speeds=Decimal("100.00")
        ))
        db.commit()
    finally:
        db.close()


def teardown_module():
    engine.dispose()
    if os.path.exists(_TMP_DB):
        os.remove(_TMP_DB)


def _reset():
    db = SessionLocal()
    try:
        db.query(JobPackaging).delete()
        db.query(ProductionJob).delete()
        db.query(JobMaster).delete()
        db.query(MachineJobSequence).delete()
        db.commit()
    finally:
        db.close()


def make_job(db, plan_date, start_hour, bottle_id=111, qty=500000):
    machine_no = 1
    resolved_job_id = generate_next_job_id(db, machine_no)
    jm = JobMaster(job_id=resolved_job_id)
    db.add(jm)
    db.flush()
    job = ProductionJob(
        job_id=jm.job_id,
        plan_date=date.fromisoformat(plan_date),
        machine_no=1,
        start_time=datetime.fromisoformat(f"{plan_date}T{start_hour}:00:00"),
        bottle_id=bottle_id,
        section=8,
        weight=Decimal("200.00"),
        speeds=Decimal("100.00"),
        draw=Decimal("100.00"),
        quantity=Decimal(str(qty)),
        required_bottles=Decimal(str(qty)),
        status="Planned",
    )
    db.add(job)
    return job


def seed_schedule(db):
    """A@09, B@10, B@11, C@12, C@13 — same machine, 07:00 start each day."""
    a = make_job(db, "2026-08-09", "07:00")
    b1 = make_job(db, "2026-08-10", "07:00")
    b2 = make_job(db, "2026-08-11", "07:00")
    c1 = make_job(db, "2026-08-12", "07:00")
    c2 = make_job(db, "2026-08-13", "07:00")
    db.flush()  # Populate job_ids
    # Packaging on a subsequent job must shift along with it.
    db.add(JobPackaging(
        job_id=b1.job_id,
        plan_date=date(2026, 8, 10),
        machine_no=1,
        bottle_id=111,
        section=8,
        start_time=datetime(2026, 8, 10, 7, 0, 0),
        packaging_type="ST",
        quantity=Decimal("100000"),
        pallet_packing=False,
    ))
    db.flush()
    return a, b1, b2, c1, c2


def plan_dates(db):
    rows = db.query(ProductionJob).filter_by(machine_no=1).order_by(ProductionJob.plan_date).all()
    return [(r.plan_date.isoformat(), r.bottle_id) for r in rows]


def test_extend_shifts_subsequent_jobs_and_inserts_continuation():
    _reset()
    db = SessionLocal()
    try:
        seed_schedule(db)
        db.commit()

        result = extend_job(
            ExtendJobRequest(plan_date=date(2026, 8, 9), machine_no=1, start_time=datetime(2026, 8, 9, 7, 0, 0), days=1),
            db=db,
            user_role="Editor",
        )
        db.commit()
        assert result is not None

        assert plan_dates(db) == [
            ("2026-08-09", 111),   # A stays
            ("2026-08-10", 111),   # A continuation (new)
            ("2026-08-11", 111),   # B1 shifted
            ("2026-08-12", 111),   # B2 shifted
            ("2026-08-13", 111),   # C1 shifted
            ("2026-08-14", 111),   # C2 shifted
        ]

        # Packaging shifted with B1 from 10 Aug to 11 Aug.
        packs = db.query(JobPackaging).filter_by(machine_no=1).all()
        assert len(packs) == 1
        assert packs[0].plan_date == date(2026, 8, 11)
        assert packs[0].start_time == datetime(2026, 8, 11, 7, 0, 0)
    finally:
        db.close()


def test_extend_continuing_job_adds_extra_day_without_duplicate():
    _reset()
    db = SessionLocal()
    try:
        # A@09 and A@10 (already continuing), then B@11
        make_job(db, "2026-08-09", "07:00")
        make_job(db, "2026-08-10", "07:00")
        make_job(db, "2026-08-11", "07:00")
        db.commit()

        result = extend_job(
            ExtendJobRequest(plan_date=date(2026, 8, 9), machine_no=1, start_time=datetime(2026, 8, 9, 7, 0, 0), days=1),
            db=db,
            user_role="Editor",
        )
        db.commit()
        assert result is not None

        assert plan_dates(db) == [
            ("2026-08-09", 111),   # A
            ("2026-08-10", 111),   # A continuation (new)
            ("2026-08-11", 111),   # A's old continuation shifted
            ("2026-08-12", 111),   # B shifted
        ]
    finally:
        db.close()


def test_extend_missing_job_raises_404():
    _reset()
    db = SessionLocal()
    try:
        from fastapi import HTTPException
        try:
            extend_job(
                ExtendJobRequest(plan_date=date(2026, 9, 1), machine_no=1, start_time=datetime(2026, 9, 1, 7, 0, 0), days=1),
                db=db,
                user_role="Editor",
            )
            assert False, "expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 404
    finally:
        db.close()


def test_extend_multiple_days_shifts_by_two():
    _reset()
    db = SessionLocal()
    try:
        seed_schedule(db)
        db.commit()

        extend_job(
            ExtendJobRequest(plan_date=date(2026, 8, 9), machine_no=1, start_time=datetime(2026, 8, 9, 7, 0, 0), days=2),
            db=db,
            user_role="Editor",
        )
        db.commit()

        assert plan_dates(db) == [
            ("2026-08-09", 111),   # A stays
            ("2026-08-10", 111),   # A continuation 1
            ("2026-08-11", 111),   # A continuation 2
            ("2026-08-12", 111),   # B1 shifted by 2
            ("2026-08-13", 111),   # B2 shifted by 2
            ("2026-08-14", 111),   # C1 shifted by 2
            ("2026-08-15", 111),   # C2 shifted by 2
        ]
    finally:
        db.close()


def test_extend_shifts_same_day_later_job_and_preserves_windows():
    """User example: A(03,10:00-14:00), B(03,15:00-19:00), C(04,07:00), D(05,07:00).
    Extending A by 1 day must push B to 04 Aug, C to 05 Aug and D to 06 Aug,
    keeping each job's start/end window intact."""
    _reset()
    db = SessionLocal()
    try:
        a = make_job(db, "2026-08-03", "10:00", qty=400000)
        a.estimated_completion = datetime(2026, 8, 3, 14, 0, 0)
        b = make_job(db, "2026-08-03", "15:00", qty=400000)
        b.estimated_completion = datetime(2026, 8, 3, 19, 0, 0)
        make_job(db, "2026-08-04", "07:00")
        make_job(db, "2026-08-05", "07:00")
        db.commit()

        extend_job(
            ExtendJobRequest(plan_date=date(2026, 8, 3), machine_no=1, start_time=datetime(2026, 8, 3, 10, 0, 0), days=1),
            db=db,
            user_role="Editor",
        )
        db.commit()

        rows = db.query(ProductionJob).filter_by(machine_no=1).order_by(ProductionJob.plan_date, ProductionJob.start_time).all()
        assert [(r.plan_date.isoformat(), r.start_time.strftime('%H:%M')) for r in rows] == [
            ("2026-08-03", "10:00"),  # A stays
            ("2026-08-04", "10:00"),  # A continuation — same 10:00 window
            ("2026-08-04", "15:00"),  # B shifted forward 1 day
            ("2026-08-05", "07:00"),  # C shifted forward 1 day
            ("2026-08-06", "07:00"),  # D shifted forward 1 day
        ]

        # A continuation ends at the source's daily window end (14:00, next day).
        cont = db.query(ProductionJob).filter_by(plan_date=date(2026, 8, 4), machine_no=1, start_time=datetime(2026, 8, 4, 10, 0, 0)).first()
        assert cont is not None
        assert cont.estimated_completion == datetime(2026, 8, 4, 14, 0, 0)
    finally:
        db.close()
