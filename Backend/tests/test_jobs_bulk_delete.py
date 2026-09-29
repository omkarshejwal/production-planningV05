"""Bulk delete endpoint (POST /jobs/bulk-delete/).

Applies the SAME per-slot rules as DELETE /jobs/{plan_date}/{machine_no}/{start_time}
in one transaction: extended-job days are removed without shifting the other
continuation days, job_master survives while any production_job row still
references it, and missing keys stay idempotent no-ops.

This module is named so it is collected after test_delete_job.py and
test_extend_job.py but before test_zz_*.py: the engine is created once from the
first test module's DATABASE_URL, so the master-data seed below is idempotent.
"""

import os

# Only takes effect when this module is the one that imports the app first
# (e.g. running it on its own).
_TMP_DB = os.path.join(os.path.dirname(__file__), "test_jobs_bulk_delete.db")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

from datetime import date, datetime, timedelta
from decimal import Decimal

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.job import JobMaster, JobPackaging, ProductionJob
from app.models.machine import MachineMaster
from app.models.product import BottleConfiguration, BottleMaster
from app.api.production.jobs import delete_jobs_bulk
from app.schemas.job import ProductionJobBulkDeleteKey, ProductionJobBulkDeleteRequest

JOB_ID = 950
MACHINE = 1
BOTTLE = 111
SECTION = 8


def setup_module():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(MachineMaster).filter_by(machine_no=MACHINE).first() is None:
            db.add(MachineMaster(machine_no=MACHINE, gob_type=3, max_section=8))
        if db.query(BottleMaster).filter_by(bottle_id=BOTTLE).first() is None:
            db.add(BottleMaster(bottle_id=BOTTLE, bottle_name="Test Bottle"))
        if (
            db.query(BottleConfiguration)
            .filter_by(machine_no=MACHINE, bottle_id=BOTTLE, section=SECTION)
            .first()
            is None
        ):
            db.add(BottleConfiguration(
                machine_no=MACHINE, bottle_id=BOTTLE, section=SECTION,
                weight=Decimal("200.00"), speeds=Decimal("100.00"),
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


def _extended_job(db, job_id=JOB_ID, start="2026-11-10", days=5):
    start_date = date.fromisoformat(start)
    for i in range(days):
        d = start_date + timedelta(days=i)
        db.add(ProductionJob(
            job_id=job_id,
            plan_date=d,
            machine_no=MACHINE,
            start_time=datetime(d.year, d.month, d.day, 7, 0, 0),
            bottle_id=BOTTLE,
            section=SECTION,
            weight=Decimal("200.00"),
            speeds=Decimal("100.00"),
            draw=Decimal("100.00"),
            quantity=Decimal("500000"),
            required_bottles=Decimal("500000"),
            status="Planned",
        ))
    db.commit()


def _plan_dates(db):
    rows = (
        db.query(ProductionJob)
        .filter_by(machine_no=MACHINE)
        .order_by(ProductionJob.plan_date)
        .all()
    )
    return [(r.job_id, r.plan_date.isoformat()) for r in rows]


def _job_master_ids(db):
    return sorted(r.job_id for r in db.query(JobMaster).all())


def _key(plan_date, start_time="07:00", job_id=JOB_ID, section=SECTION):
    return ProductionJobBulkDeleteKey(
        plan_date=date.fromisoformat(plan_date),
        machine_no=MACHINE,
        start_time=start_time,
        job_id=job_id,
        section=section,
    )


def test_bulk_delete_removes_every_requested_day_and_cleans_job_master():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=JOB_ID))
        db.commit()
        _extended_job(db)

        result = delete_jobs_bulk(
            req=ProductionJobBulkDeleteRequest(keys=[
                _key("2026-11-10"),
                _key("2026-11-11"),
                _key("2026-11-12"),
                _key("2026-11-13"),
                _key("2026-11-14"),
            ]),
            db=db,
            user_role="Editor",
        )

        assert result == {"deleted": 5}
        db.expire_all()
        assert _plan_dates(db) == []
        assert _job_master_ids(db) == []
    finally:
        db.close()


def test_bulk_delete_keeps_the_unrequested_days_of_an_extended_job():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=JOB_ID))
        db.commit()
        _extended_job(db)

        result = delete_jobs_bulk(
            req=ProductionJobBulkDeleteRequest(keys=[
                _key("2026-11-11"),
                _key("2026-11-13"),
            ]),
            db=db,
            user_role="Editor",
        )

        assert result == {"deleted": 2}
        db.expire_all()
        assert _plan_dates(db) == [
            (JOB_ID, "2026-11-10"), (JOB_ID, "2026-11-12"), (JOB_ID, "2026-11-14"),
        ]
        assert _job_master_ids(db) == [JOB_ID]
    finally:
        db.close()


def test_bulk_delete_treats_missing_keys_as_idempotent_noops():
    _reset()
    db = SessionLocal()
    try:
        db.add(JobMaster(job_id=JOB_ID))
        db.commit()
        _extended_job(db, days=2)

        result = delete_jobs_bulk(
            req=ProductionJobBulkDeleteRequest(keys=[
                _key("2026-11-10"),
                _key("2026-12-31"),
                ProductionJobBulkDeleteKey(
                    plan_date=date.fromisoformat("2026-11-10"),
                    machine_no=MACHINE,
                    start_time="23:00",
                    job_id=JOB_ID,
                    section=SECTION,
                ),
            ]),
            db=db,
            user_role="Editor",
        )

        assert result == {"deleted": 1}
        db.expire_all()
        assert _plan_dates(db) == [(JOB_ID, "2026-11-11")]
        assert _job_master_ids(db) == [JOB_ID]
    finally:
        db.close()


def test_bulk_delete_with_no_keys_is_a_noop():
    _reset()
    db = SessionLocal()
    try:
        assert delete_jobs_bulk(
            req=ProductionJobBulkDeleteRequest(keys=[]),
            db=db,
            user_role="Editor",
        ) == {"deleted": 0}
    finally:
        db.close()
