"""Validation of the (bottle_id, machine_no, section) composite key.

production_job carries fk_production_job_configuration on exactly that
combination, so a save must NEVER fall back to another section's or another
machine's bottle_configuration row.  A row that does not exist verbatim in
bottle_configuration has to be rejected with an HTTP 400 naming the job,
bottle, machine and section — instead of reaching the database and blowing up
with a foreign-key violation.

This module is named so that it is collected LAST: the engine is created once
from the first test module's DATABASE_URL, and the ids seeded here are unique
to this file so it can share that database with the other test modules.
"""

import os

# Only takes effect when this module is the one that imports the app first
# (e.g. running it on its own).
_TMP_DB = os.path.join(os.path.dirname(__file__), "test_zz_bulk_job_config_validation.db")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.job import JobMaster, JobPackaging, MachineJobSequence, ProductionJob
from app.models.machine import MachineMaster
from app.models.product import BottleConfiguration, BottleMaster
from app.api.production.jobs import create_job, create_jobs_bulk
from app.schemas.job import ProductionJobBulkRequest, ProductionJobCreate

# Module-unique ids: never collide with machine 1 / bottle 111 used elsewhere.
M2, M3 = 2, 3
PROTO_M2, PROTO_M3, UNIQUE = 500, 501, 502


def setup_module():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Fresh workspace for the job tables.
        db.query(JobPackaging).delete()
        db.query(ProductionJob).delete()
        db.query(JobMaster).delete()
        db.query(MachineJobSequence).delete()

        # Idempotent re-seed of this module's master data.
        db.query(BottleConfiguration).filter(
            BottleConfiguration.bottle_id.in_([PROTO_M2, PROTO_M3, UNIQUE])
        ).delete(synchronize_session=False)
        db.query(BottleMaster).filter(
            BottleMaster.bottle_id.in_([PROTO_M2, PROTO_M3, UNIQUE])
        ).delete(synchronize_session=False)
        db.query(MachineMaster).filter(MachineMaster.machine_no.in_([M2, M3])).delete(
            synchronize_session=False
        )
        db.commit()

        db.add_all(
            [
                MachineMaster(machine_no=M2, gob_type=2, max_section=10),
                MachineMaster(machine_no=M3, gob_type=2, max_section=10),
                # Two DIFFERENT bottles sharing one name, on different machines.
                BottleMaster(bottle_id=PROTO_M2, bottle_name="230 ml Protone"),
                BottleMaster(bottle_id=PROTO_M3, bottle_name="230 ml Protone"),
                BottleMaster(bottle_id=UNIQUE, bottle_name="300 ml Unique"),
                # machine 2 / bottle 500 → sections 7 and 8 only.
                BottleConfiguration(
                    machine_no=M2, bottle_id=PROTO_M2, section=7,
                    weight=Decimal("214.00"), speeds=Decimal("77.00"),
                ),
                BottleConfiguration(
                    machine_no=M2, bottle_id=PROTO_M2, section=8,
                    weight=Decimal("214.00"), speeds=Decimal("88.00"),
                ),
                # machine 3 / bottle 501 → sections 8 and 9 only.
                BottleConfiguration(
                    machine_no=M3, bottle_id=PROTO_M3, section=8,
                    weight=Decimal("215.00"), speeds=Decimal("90.40"),
                ),
                BottleConfiguration(
                    machine_no=M3, bottle_id=PROTO_M3, section=9,
                    weight=Decimal("215.00"), speeds=Decimal("101.70"),
                ),
                # machine 2 / bottle 502 → section 10 only.
                BottleConfiguration(
                    machine_no=M2, bottle_id=UNIQUE, section=10,
                    weight=Decimal("300.00"), speeds=Decimal("120.00"),
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def teardown_module():
    # The engine may be shared with other modules — dispose only, and remove
    # this module's own file when it happens to be the active one.
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


def _job(plan_date, machine_no, bottle_id, section, start="07:00", job_id=None):
    return ProductionJobCreate(
        job_id=job_id,
        plan_date=date.fromisoformat(plan_date),
        machine_no=machine_no,
        start_time=datetime.fromisoformat(f"{plan_date}T{start}:00"),
        bottle_id=bottle_id,
        section=section,
        draw=Decimal("0"),
        required_bottles=Decimal("1000"),
        status="Planned",
    )


def _count_jobs(db):
    return db.query(ProductionJob).count()


def test_bulk_accepts_exact_composite_key():
    _reset()
    db = SessionLocal()
    try:
        result = create_jobs_bulk(
            ProductionJobBulkRequest(jobs=[_job("2026-09-01", M2, PROTO_M2, 8)]),
            db=db,
            _user=None,
        )
        assert len(result) == 1
        assert result[0]["bottle_id"] == PROTO_M2
        assert result[0]["section"] == 8
        assert Decimal(str(result[0]["weight"])) == Decimal("214.00")
        assert Decimal(str(result[0]["speeds"])) == Decimal("88.00")

        row = db.query(ProductionJob).filter_by(plan_date=date(2026, 9, 1)).one()
        assert row.bottle_id == PROTO_M2
        assert row.section == 8
        assert row.weight == Decimal("214.00")
        assert row.speeds == Decimal("88.00")
    finally:
        db.close()


def test_bulk_rejects_bottle_not_configured_on_that_machine():
    """Bottle 501 lives on machine 3 only — machine 2 must not accept it."""
    _reset()
    db = SessionLocal()
    try:
        with _expect_400("row 1", "2026-09-02", "bottle_id=501", "machine_no=2", "section=8"):
            create_jobs_bulk(
                ProductionJobBulkRequest(jobs=[_job("2026-09-02", M2, PROTO_M3, 8)]),
                db=db,
                _user=None,
            )
        # Nothing was written: the batch is all-or-nothing.
        assert _count_jobs(db) == 0
        assert db.query(JobMaster).count() == 0
    finally:
        db.close()


def test_bulk_rejects_section_without_configuration():
    """Machine 2 / bottle 500 is configured for sections 7 and 8 — not 10."""
    _reset()
    db = SessionLocal()
    try:
        with _expect_400("row 1", "2026-09-03", "bottle_id=500", "machine_no=2", "section=10"):
            create_jobs_bulk(
                ProductionJobBulkRequest(jobs=[_job("2026-09-03", M2, PROTO_M2, 10)]),
                db=db,
                _user=None,
            )
        assert _count_jobs(db) == 0
    finally:
        db.close()


def test_bulk_validates_every_row_before_writing_anything():
    _reset()
    db = SessionLocal()
    try:
        jobs = [
            _job("2026-09-04", M2, PROTO_M2, 8),   # valid
            _job("2026-09-04", M2, PROTO_M3, 8, start="15:00"),  # invalid
        ]
        with _expect_400("row 2", "2026-09-04", "bottle_id=501", "machine_no=2", "section=8"):
            create_jobs_bulk(ProductionJobBulkRequest(jobs=jobs), db=db, _user=None)

        assert _count_jobs(db) == 0
        assert db.query(JobMaster).count() == 0
        assert db.query(MachineJobSequence).count() == 0
    finally:
        db.close()


def test_bulk_keeps_duplicate_names_on_their_own_machines():
    """Same bottle NAME, two ids: each machine keeps its own bottle."""
    _reset()
    db = SessionLocal()
    try:
        result = create_jobs_bulk(
            ProductionJobBulkRequest(
                jobs=[
                    _job("2026-09-05", M2, PROTO_M2, 7),
                    _job("2026-09-05", M3, PROTO_M3, 8, start="15:00"),
                ]
            ),
            db=db,
            _user=None,
        )
        assert len(result) == 2
        by_machine = {r["machine_no"]: r for r in result}
        assert by_machine[M2]["bottle_id"] == PROTO_M2
        assert Decimal(str(by_machine[M2]["weight"])) == Decimal("214.00")
        assert by_machine[M3]["bottle_id"] == PROTO_M3
        assert Decimal(str(by_machine[M3]["weight"])) == Decimal("215.00")

        rows = db.query(ProductionJob).order_by(ProductionJob.machine_no).all()
        assert [r.bottle_id for r in rows] == [PROTO_M2, PROTO_M3]
        assert [r.weight for r in rows] == [Decimal("214.00"), Decimal("215.00")]
    finally:
        db.close()


def test_create_job_rejects_unconfigured_section_without_falling_back():
    """create_job used to fall back to ANY section — that is now a 400."""
    _reset()
    db = SessionLocal()
    try:
        with _expect_400("job 201", "2026-09-06", "bottle_id=500", "machine_no=2", "section=10"):
            create_job(_job("2026-09-06", M2, PROTO_M2, 10), db=db, _user=None)
        assert _count_jobs(db) == 0
    finally:
        db.close()


def test_create_job_rejects_another_machine_s_bottle():
    _reset()
    db = SessionLocal()
    try:
        with _expect_400("job 201", "2026-09-07", "bottle_id=501", "machine_no=2", "section=8"):
            create_job(_job("2026-09-07", M2, PROTO_M3, 8), db=db, _user=None)
        assert _count_jobs(db) == 0
    finally:
        db.close()


def test_create_job_stores_the_requested_section_and_its_own_config():
    """The stored row uses THIS machine's weight/speed for the requested section."""
    _reset()
    db = SessionLocal()
    try:
        created = create_job(_job("2026-09-08", M3, PROTO_M3, 8), db=db, _user=None)
        assert created.section == 8
        assert created.bottle_id == PROTO_M3
        assert created.weight == Decimal("215.00")
        assert created.speeds == Decimal("90.40")

        row = db.query(ProductionJob).filter_by(plan_date=date(2026, 9, 8)).one()
        assert row.section == 8
        assert row.weight == Decimal("215.00")
        assert row.speeds == Decimal("90.40")
    finally:
        db.close()


def test_create_job_never_stores_a_section_the_bottle_is_not_configured_for():
    """Upsert keying uses the requested section — no silent re-keying."""
    _reset()
    db = SessionLocal()
    try:
        create_job(_job("2026-09-09", M2, UNIQUE, 10), db=db, _user=None)
        rows = db.query(ProductionJob).filter_by(plan_date=date(2026, 9, 9)).all()
        assert len(rows) == 1
        assert rows[0].section == 10
        assert rows[0].bottle_id == UNIQUE
        assert rows[0].weight == Decimal("300.00")
    finally:
        db.close()


class _expect_400:
    """Assert that an HTTPException 400 whose detail names all key parts."""

    def __init__(self, *needles: str):
        self.needles = needles

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        assert exc_type is not None, "expected an HTTPException to be raised"
        assert issubclass(exc_type, HTTPException), f"unexpected exception: {exc!r}"
        assert exc.status_code == 400, f"expected 400, got {exc.status_code}: {exc.detail}"
        detail = str(exc.detail)
        for needle in self.needles:
            assert needle in detail, f"detail must mention {needle!r}, got: {detail}"
        return True
