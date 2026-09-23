import os

# Force a local temp SQLite DB BEFORE any app module imports the real engine.
_TMP_DB = os.path.join(os.path.dirname(__file__), "test_delete_job.db")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

from datetime import date, datetime, timedelta
from decimal import Decimal

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.job import JobMaster, ProductionJob, JobPackaging
from app.models.machine import MachineMaster
from app.models.product import BottleMaster, BottleConfiguration
from app.api.production.jobs import delete_job


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
        db.commit()
    finally:
        db.close()


def _extended_job(db, job_id=427, start="2026-09-22", days=5, section=8):
    """Insert `days` production_job rows sharing job_id across consecutive days."""
    start_date = date.fromisoformat(start)
    for i in range(days):
        d = start_date + timedelta(days=i)
        db.add(ProductionJob(
            job_id=job_id,
            plan_date=d,
            machine_no=1,
            start_time=datetime(d.year, d.month, d.day, 7, 0, 0),
            bottle_id=111,
            section=section,
            weight=Decimal("200.00"),
            speeds=Decimal("100.00"),
            draw=Decimal("100.00"),
            quantity=Decimal("500000"),
            required_bottles=Decimal("500000"),
            status="Planned",
        ))
    db.commit()


def _plan_dates(db):
    rows = db.query(ProductionJob).filter_by(machine_no=1).order_by(ProductionJob.plan_date).all()
    return [(r.job_id, r.plan_date.isoformat()) for r in rows]


def _job_master_ids(db):
    return sorted(r.job_id for r in db.query(JobMaster).all())


def test_delete_last_day_of_extended_job_keeps_other_days_and_job_master():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=427))
        db.commit()
        _extended_job(db)  # Sep 22..26, all job_id 427
        assert _plan_dates(db) == [
            (427, "2026-09-22"), (427, "2026-09-23"), (427, "2026-09-24"),
            (427, "2026-09-25"), (427, "2026-09-26"),
        ]

        delete_job(plan_date="2026-09-26", machine_no=1, start_time="07:00",
                   job_id=427, section=8, db=db, user_role="Editor")

        # Only Sep 26 removed; the other extended days keep their dates.
        assert _plan_dates(db) == [
            (427, "2026-09-22"), (427, "2026-09-23"), (427, "2026-09-24"), (427, "2026-09-25"),
        ]
        # job_master 427 must remain because production_job rows still reference it.
        assert _job_master_ids(db) == [427]
    finally:
        db.close()


def test_delete_middle_day_of_extended_job_leaves_others_untouched():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=427))
        db.commit()
        _extended_job(db)

        delete_job(plan_date="2026-09-24", machine_no=1, start_time="07:00",
                   job_id=427, section=8, db=db, user_role="Editor")

        # Only the removed day is gone — no backward shift of continuation days.
        assert _plan_dates(db) == [
            (427, "2026-09-22"), (427, "2026-09-23"), (427, "2026-09-25"), (427, "2026-09-26"),
        ]
        assert _job_master_ids(db) == [427]
    finally:
        db.close()


def test_delete_all_days_removes_job_master():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=427))
        db.commit()
        _extended_job(db)

        for day in range(22, 27):
            delete_job(plan_date=f"2026-09-{day}", machine_no=1, start_time="07:00",
                       job_id=427, section=8, db=db, user_role="Editor")

        assert _plan_dates(db) == []
        # job_master is removed only once NO production_job rows reference it.
        assert _job_master_ids(db) == []
    finally:
        db.close()


def test_delete_non_existent_day_is_idempotent_noop():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=427))
        db.commit()
        _extended_job(db)

        # Row was never persisted — must not raise 404; treated as already gone.
        result = delete_job(plan_date="2026-10-01", machine_no=1, start_time="07:00",
                            db=db, user_role="Editor")
        assert result is None
        assert len(_plan_dates(db)) == 5
        assert _job_master_ids(db) == [427]
    finally:
        db.close()


def test_job_id_scopes_delete_to_exact_row_in_multi_section_slot():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=427))
        db.add(JobMaster(job_id=428))
        db.commit()

        d = date(2026, 9, 22)
        rows = [
            ProductionJob(job_id=427, plan_date=d, machine_no=1, start_time=datetime(2026, 9, 22, 7, 0, 0),
                          bottle_id=111, section=6, weight=Decimal("200.00"), speeds=Decimal("100.00"),
                          draw=Decimal("100.00"), quantity=Decimal("500000"),
                          required_bottles=Decimal("500000"), status="Planned"),
            ProductionJob(job_id=427, plan_date=d, machine_no=1, start_time=datetime(2026, 9, 22, 7, 0, 0),
                          bottle_id=111, section=8, weight=Decimal("200.00"), speeds=Decimal("100.00"),
                          draw=Decimal("100.00"), quantity=Decimal("500000"),
                          required_bottles=Decimal("500000"), status="Planned"),
            ProductionJob(job_id=428, plan_date=d, machine_no=1, start_time=datetime(2026, 9, 22, 7, 0, 0),
                          bottle_id=111, section=7, weight=Decimal("200.00"), speeds=Decimal("100.00"),
                          draw=Decimal("100.00"), quantity=Decimal("500000"),
                          required_bottles=Decimal("500000"), status="Planned"),
        ]
        for r in rows:
            db.add(r)
        db.commit()

        # Delete only job 427 / section 6 at that slot.
        delete_job(plan_date="2026-09-22", machine_no=1, start_time="07:00",
                   job_id=427, section=6, db=db, user_role="Editor")

        remaining = db.query(ProductionJob).filter_by(machine_no=1).order_by(ProductionJob.job_id, ProductionJob.section).all()
        assert [(r.job_id, r.section) for r in remaining] == [(427, 8), (428, 7)]
        # job_master 427 still referenced by its section-8 row.
        assert _job_master_ids(db) == [427, 428]
    finally:
        db.close()


def test_delete_standalone_job_still_shifts_subsequent_jobs():
    _reset()
    db = SessionLocal()
    try:
        # Two distinct jobs on consecutive days (NO shared job_id).
        db.add(JobMaster(job_id=101))
        db.add(JobMaster(job_id=102))
        db.commit()
        job101 = ProductionJob(
            job_id=101, plan_date=date(2026, 9, 22), machine_no=1,
            start_time=datetime(2026, 9, 22, 7, 0, 0), bottle_id=111, section=8,
            weight=Decimal("200.00"), speeds=Decimal("100.00"), draw=Decimal("100.00"),
            quantity=Decimal("500000"), required_bottles=Decimal("500000"), status="Planned",
        )
        job102 = ProductionJob(
            job_id=102, plan_date=date(2026, 9, 23), machine_no=1,
            start_time=datetime(2026, 9, 23, 7, 0, 0), bottle_id=111, section=8,
            weight=Decimal("200.00"), speeds=Decimal("100.00"), draw=Decimal("100.00"),
            quantity=Decimal("500000"), required_bottles=Decimal("500000"), status="Planned",
        )
        db.add(job101)
        db.add(job102)
        db.commit()

        delete_job(plan_date="2026-09-22", machine_no=1, start_time="07:00",
                   job_id=101, section=8, db=db, user_role="Editor")

        # 101 removed and orphaned job_master cleaned; 102 shifts back to the 22nd.
        assert _plan_dates(db) == [(102, "2026-09-22")]
        assert _job_master_ids(db) == [102]
    finally:
        db.close()


def test_delete_route_binds_job_id_and_section_query_params():
    """Verify the route registers and exposes job_id/section as optional query params."""
    from app.main import app

    path = "/api/production/jobs/{plan_date}/{machine_no}/{start_time}"
    delete_op = app.openapi()["paths"][path]["delete"]
    query_params = {
        p["name"]: p["schema"]
        for p in delete_op.get("parameters", [])
        if p["in"] == "query"
    }
    assert query_params["job_id"]["anyOf"] == [{"type": "integer"}, {"type": "null"}]
    assert query_params["section"]["anyOf"] == [{"type": "integer"}, {"type": "null"}]