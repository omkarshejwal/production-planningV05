# pyrefly: ignore [missing-import]
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select
from datetime import datetime, date, time as dtime
from typing import Dict, Any, Optional, Tuple

from app.db.session import get_db
from app.models.quality import (
    HourlyProductionReport, ShiftAssignment, HourlyProduction,
    DefectMaster, HourlyProductionDefect, HprJob
)
from app.schemas.quality import QualityDailyRequest, QualityDailyResponse, QualityHourlyEntrySchema, QualityShiftAssignmentSchema
from app.api.permissions import require_module_read, require_module_edit, MODULE_QUALITY_CONTROL
from app.models.auth import AuthUser

logger = logging.getLogger(__name__)

router = APIRouter()

PRODUCTION_TIMES = [
    {'time': '9:00 AM', 'shift_id': 1}, {'time': '10:00 AM', 'shift_id': 1},
    {'time': '11:00 AM', 'shift_id': 1}, {'time': '12:00 PM', 'shift_id': 1},
    {'time': '1:00 PM', 'shift_id': 1}, {'time': '2:00 PM', 'shift_id': 1},
    {'time': '3:00 PM', 'shift_id': 1}, {'time': '4:00 PM', 'shift_id': 1},
    {'time': '5:00 PM', 'shift_id': 2}, {'time': '6:00 PM', 'shift_id': 2},
    {'time': '7:00 PM', 'shift_id': 2}, {'time': '8:00 PM', 'shift_id': 2},
    {'time': '9:00 PM', 'shift_id': 2}, {'time': '10:00 PM', 'shift_id': 2},
    {'time': '11:00 PM', 'shift_id': 2}, {'time': '12:00 AM', 'shift_id': 2},
    {'time': '1:00 AM', 'shift_id': 3}, {'time': '2:00 AM', 'shift_id': 3},
    {'time': '3:00 AM', 'shift_id': 3}, {'time': '4:00 AM', 'shift_id': 3},
    {'time': '5:00 AM', 'shift_id': 3}, {'time': '6:00 AM', 'shift_id': 3},
    {'time': '7:00 AM', 'shift_id': 3}, {'time': '8:00 AM', 'shift_id': 3},
]

MACHINES = [1, 2, 3, 4]
SHIFTS = [1, 2, 3]

def _parse_time_string(time_str: str) -> dtime:
    """Parse a grid label ("9:00 AM") into a normalized time-of-day.

    The canonical 12-hour label is tried first, then the common variants a
    client may send ("09:00", "09:00:00", "9:00am"), so a single reformatted
    label can never abort an entire save. Seconds and microseconds are always
    dropped so every key built from the result compares equal.
    """
    raw = (time_str or "").strip().upper()
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).time().replace(second=0, microsecond=0)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised production time {time_str!r}")


def _slot_time(time_str: str) -> dtime:
    """Like `_parse_time_string` but reports a 400 instead of a 500."""
    try:
        return _parse_time_string(time_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid production time: {time_str!r}")


def _norm_time(value: Any) -> Optional[dtime]:
    """Normalize a stored/incoming `production_time` to a time-of-day.

    `hpr.hourly_production.production_time` is declared as a DATETIME column,
    but depending on the driver, the column type actually provisioned, or how a
    row was written, the value read back may be a `datetime`, a plain `time`
    (TIME column) or a string. Every entry-map key must be built from the same
    normalized time-of-day on both sides — otherwise an existing row is never
    matched, the save inserts a duplicate (or trips `uq_hpr_machine_hour` and
    rolls the whole request back) and the previously saved `bottle_id` is lost.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.time().replace(second=0, microsecond=0)
    if isinstance(value, dtime):
        return value.replace(second=0, microsecond=0)
    raw = str(value).strip()
    # A driver may hand back the whole date-time as a string; without a date
    # part none of the grid-label formats below match, the row is skipped and
    # the next save inserts a duplicate for a slot that already exists.
    try:
        return datetime.fromisoformat(raw).time().replace(second=0, microsecond=0)
    except ValueError:
        pass
    try:
        return _parse_time_string(raw)
    except ValueError:
        return None


def _entry_key(machine_no: int, production_time: Any) -> Tuple[int, Optional[dtime]]:
    """The single canonical identity of an hourly row: machine + time-of-day."""
    return (machine_no, _norm_time(production_time))

def get_default_shape(date_str: str) -> QualityDailyResponse:
    hourly = {str(m): {} for m in MACHINES}
    for m in MACHINES:
        for pt in PRODUCTION_TIMES:
            hourly[str(m)][pt['time']] = QualityHourlyEntrySchema(
                entry_id=f"{date_str}:{m}:{pt['time']}",
                report_id=date_str,
                machine_no=m,
                shift_id=pt['shift_id'],
                production_time=pt['time'],
                bottle_id=None,
                section=None,
                weight_front=None,
                weight_middle=None,
                weight_rear=None,
                weight_avg=None,
                speed_per_min=None,
                packing_category=[],
                packing_size=None,
                cartons=None,
                bottles_in_nos=None,
                efficiency_percentage=None,
                sqc=None,
                qc_hold=None,
                num=None,
                remarks=None,
                defect_ids=[],
                job_id=None
            )
    
    shifts = {str(s): QualityShiftAssignmentSchema(supervisor="", executive="") for s in SHIFTS}
    
    return QualityDailyResponse(hourly=hourly, shift_assignments=shifts)


@router.get("/", response_model=QualityDailyResponse)
def get_daily_quality(date: str, db: Session = Depends(get_db), _user: AuthUser = Depends(require_module_read(MODULE_QUALITY_CONTROL))):
    try:
        query_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    report = db.query(HourlyProductionReport).filter_by(production_date=query_date).first()
    if not report:
        return get_default_shape(date)

    response = get_default_shape(date)

    # Load shift assignments
    assignments = db.query(ShiftAssignment).filter_by(report_id=report.report_id).all()
    for assignment in assignments:
        response.shift_assignments[str(assignment.shift_id)] = QualityShiftAssignmentSchema(
            supervisor=assignment.supervisor or "",
            executive=assignment.executive or ""
        )

    # Load hourly entries with defects eagerly loaded
    entries = db.query(HourlyProduction).options(
        selectinload(HourlyProduction.defects)
    ).filter_by(report_id=report.report_id).all()

    for entry in entries:
        m = str(entry.machine_no)
        response.hourly.setdefault(m, {})

        # Reconstruct the canonical grid label ("9:00 AM", "10:00 PM", ...)
        # straight from the normalized time-of-day. Building it ourselves keeps
        # the key identical to the labels the UI renders regardless of locale or
        # driver quirks, so a saved row can never land under a second, unknown
        # key that the grid would show as an empty slot.
        slot = _norm_time(entry.production_time)
        if slot is None:
            continue
        pt_time = f"{slot.hour % 12 or 12}:{slot.minute:02d} {'AM' if slot.hour < 12 else 'PM'}"

        # packing_category is stored as comma separated string? Frontend expects array
        pc = entry.packing_category.split(",") if entry.packing_category else []
        pc = [x.strip() for x in pc if x.strip()]

        candidate = QualityHourlyEntrySchema(
            entry_id=f"{date}:{entry.machine_no}:{pt_time}",
            report_id=date,
            machine_no=entry.machine_no,
            shift_id=entry.shift_id,
            production_time=pt_time,
            bottle_id=entry.bottle_id,
            section=entry.section,
            weight_front=entry.weight_front,
            weight_middle=entry.weight_middle,
            weight_rear=entry.weight_rear,
            weight_avg=entry.weight_avg,
            speed_per_min=entry.speed_per_min,
            packing_category=pc,
            packing_size=entry.packing_size,
            cartons=entry.cartons,
            bottles_in_nos=entry.bottles_in_nos,
            efficiency_percentage=float(entry.efficiency_percent) if entry.efficiency_percent is not None else None,
            sqc=entry.sqc,
            qc_hold=int(entry.qc_hold) if entry.qc_hold is not None else None,
            num=entry.num,
            remarks=entry.remarks,
            defect_ids=[d.defect_name for d in entry.defects],
            job_id=entry.job_id
        )

        # If duplicate historical rows map onto the same slot, keep whichever
        # carries data instead of letting a later, emptier row hide a saved
        # bottle selection.
        existing_slot = response.hourly[m].get(pt_time)
        if existing_slot is not None and _has_meaningful_data(existing_slot) and not _has_meaningful_data(candidate):
            continue
        response.hourly[m][pt_time] = candidate

    return response


def _has_meaningful_data(entry_data: QualityHourlyEntrySchema) -> bool:
    fields = [
        entry_data.bottle_id,
        entry_data.section,
        entry_data.weight_front,
        entry_data.weight_middle,
        entry_data.weight_rear,
        entry_data.weight_avg,
        entry_data.speed_per_min,
        entry_data.packing_size,
        entry_data.cartons,
        entry_data.bottles_in_nos,
        entry_data.efficiency_percentage,
        entry_data.sqc,
        entry_data.num,
        entry_data.remarks,
    ]
    for val in fields:
        if val is not None and str(val).strip():
            return True
    if entry_data.qc_hold is not None and entry_data.qc_hold != 0:
        return True
    if entry_data.packing_category and any(str(x).strip() for x in entry_data.packing_category if x):
        return True
    if entry_data.defect_ids and any(str(d).strip() for d in entry_data.defect_ids if d):
        return True
    return False


@router.post("/", response_model=QualityDailyResponse)
def save_daily_quality(
    payload: QualityDailyRequest,
    db: Session = Depends(get_db),
    _user: AuthUser = Depends(require_module_edit(MODULE_QUALITY_CONTROL))
):
    try:
        p_date = datetime.strptime(payload.production_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    try:
        # Step 1: Get or Create Report
        report = db.query(HourlyProductionReport).filter_by(production_date=p_date).first()
        if not report:
            report = HourlyProductionReport(production_date=p_date)
            db.add(report)
            db.flush() # get report_id

        # Step 2: Upsert Shift Assignments
        existing_assignments = db.query(ShiftAssignment).filter_by(report_id=report.report_id).all()
        sa_map = {sa.shift_id: sa for sa in existing_assignments}

        for shift_id_str, sa_data in payload.shift_assignments.items():
            s_id = int(shift_id_str)
            if s_id in sa_map:
                sa_map[s_id].supervisor = sa_data.supervisor
                sa_map[s_id].executive = sa_data.executive
            else:
                new_sa = ShiftAssignment(
                    report_id=report.report_id,
                    shift_id=s_id,
                    supervisor=sa_data.supervisor,
                    executive=sa_data.executive
                )
                db.add(new_sa)

        # Pre-load defects to resolve names -> IDs
        # Gather all unique defect names from the payload
        all_defect_names = set()
        for m_dict in payload.hourly.values():
            for entry_data in m_dict.values():
                all_defect_names.update(entry_data.defect_ids)

        defect_map = {}
        if all_defect_names:
            db_defects = db.query(DefectMaster).filter(DefectMaster.defect_name.in_(all_defect_names)).all()
            defect_map = {d.defect_name: d for d in db_defects}
            
            # Check for any unresolvable defect names
            missing_defects = all_defect_names - set(defect_map.keys())
            if missing_defects:
                raise HTTPException(status_code=400, detail=f"Unresolvable defect names: {', '.join(missing_defects)}")

        # Step 3: Upsert Hourly Entries
        existing_entries = db.query(HourlyProduction).options(
            selectinload(HourlyProduction.defects)
        ).filter_by(report_id=report.report_id).all()

        # Rows are identified by (machine_no, NORMALIZED time-of-day) — never by
        # the raw production_time object. The column is a DATETIME, but depending
        # on the driver / the column actually provisioned / how a row was written
        # the value read back may be a datetime, a plain time or a string. If the
        # key built from the database and the key built from the request are not
        # normalized identically, an existing row is never matched: the save then
        # inserts a duplicate (or trips uq_hpr_machine_hour and rolls the whole
        # request back), and the previously saved bottle_id is lost.
        entry_map: Dict[Tuple[int, Optional[dtime]], HourlyProduction] = {}
        for e in existing_entries:
            key = _entry_key(e.machine_no, e.production_time)
            current = entry_map.get(key)
            # If legacy duplicates map onto one slot, keep the row that carries a
            # bottle so we update the meaningful row instead of an empty one.
            if current is None or (current.bottle_id is None and e.bottle_id is not None):
                entry_map[key] = e

        # Snapshot of the OLD (job_id, bottle_id) pairs, taken from the SAME rows
        # entry_map resolved to, before any mutations occur, so Step 4.5 can
        # reuse a job id only when it still belongs to the same bottle.
        old_job_snapshot: Dict[Tuple[int, Optional[dtime]], Tuple[Optional[str], Optional[int]]] = {
            key: (e.job_id.strip() if e.job_id and e.job_id.strip() else None, e.bottle_id)
            for key, e in entry_map.items()
        }

        for machine_str, m_dict in payload.hourly.items():
            machine_no = int(machine_str)
            for time_str, entry_data in m_dict.items():
                parsed_time = _slot_time(time_str)
                # handle overnight shifts
                # Shift 3 is 1am to 9am, it actually belongs to the next calendar day
                # But typically production_date stays the same for the whole shift
                # We combine it directly:
                entry_dt = datetime.combine(p_date, parsed_time)
                map_key = (machine_no, parsed_time)

                # Check if it exists
                entry = entry_map.get(map_key)

                incoming_has_data = _has_meaningful_data(entry_data)
                # The frontend stamps every row it read from the database with a
                # synthetic entry_id. A row WITHOUT one was invented locally by a
                # blank slot and must never blank out a stored row. An empty row
                # that DOES carry an entry_id is an explicit clear ("−" button /
                # "— Select bottle") and is still applied.
                incoming_is_known_row = bool(str(entry_data.entry_id or "").strip())

                if not incoming_has_data and (entry is None or not incoming_is_known_row):
                    # Nothing to create and nothing the operator could have
                    # deliberately cleared — leave the stored row untouched.
                    continue

                stored_bottle_id = entry.bottle_id if entry is not None else None

                # prepare field values
                b_id = entry_data.bottle_id
                sec = entry_data.section
                w_f = entry_data.weight_front
                w_m = entry_data.weight_middle
                w_r = entry_data.weight_rear
                w_a = entry_data.weight_avg
                s_p_m = entry_data.speed_per_min
                p_c = (", ".join(entry_data.packing_category) if entry_data.packing_category else None) if isinstance(entry_data.packing_category, list) else (entry_data.packing_category or None)
                p_s = entry_data.packing_size
                ctns = entry_data.cartons
                binos = entry_data.bottles_in_nos
                eff = entry_data.efficiency_percentage
                if eff is not None:
                    try:
                        eff = round(min(max(float(eff), 0.0), 999.99), 2)
                    except (ValueError, TypeError):
                        eff = None
                sq = entry_data.sqc
                qch = entry_data.qc_hold
                n_val = entry_data.num
                rmk = entry_data.remarks

                if entry is None:
                    entry = HourlyProduction(
                        report_id=report.report_id,
                        machine_no=machine_no,
                        shift_id=entry_data.shift_id,
                        production_time=entry_dt,
                        bottle_id=b_id, section=sec,
                        weight_front=w_f, weight_middle=w_m, weight_rear=w_r, weight_avg=w_a,
                        speed_per_min=s_p_m, packing_category=p_c, packing_size=p_s,
                        cartons=ctns, bottles_in_nos=binos, efficiency_percent=eff,
                        sqc=sq, qc_hold=qch, num=n_val, remarks=rmk,
                        # hourly_production.job_id is a NOT NULL column. A row that
                        # does not belong to a job yet must be stored as an empty id
                        # — writing NULL raises an IntegrityError, the transaction
                        # rolls back and EVERY row for the day is silently lost.
                        job_id=entry_data.job_id or ""
                    )
                    db.add(entry)
                    entry_map[map_key] = entry
                else:
                    entry.bottle_id = b_id
                    entry.section = sec
                    entry.weight_front = w_f
                    entry.weight_middle = w_m
                    entry.weight_rear = w_r
                    entry.weight_avg = w_a
                    entry.speed_per_min = s_p_m
                    entry.packing_category = p_c
                    entry.packing_size = p_s
                    entry.cartons = ctns
                    entry.bottles_in_nos = binos
                    entry.efficiency_percent = eff
                    entry.sqc = sq
                    entry.qc_hold = qch
                    entry.num = n_val
                    entry.remarks = rmk
                    if entry_data.job_id:
                        entry.job_id = entry_data.job_id
                    elif b_id is None and stored_bottle_id is not None:
                        # The bottle was cleared on this row, so its job
                        # reference no longer applies. The column is NOT NULL,
                        # so the cleared state is an empty id, never NULL.
                        entry.job_id = ""
                    # Otherwise keep the stored job_id: a client that simply did
                    # not echo it back must never blank a valid id.

                # Step 4: Replace all defects
                # hpr.hourly_production_defect has PRIMARY KEY (entry_id, defect_id),
                # so a repeated defect name in one row would be two inserts of the
                # same key: an IntegrityError that rolls back the WHOLE day. The
                # set of names is already validated above; dedup here.
                entry.defects = list({dname: defect_map[dname] for dname in entry_data.defect_ids}.values())

        # Step 4.5: Compute canonical job_id and upsert HPR Job rows
        # Seed the next available sequence number once per save_daily_quality call across all machines/runs
        # Note: Known small race-condition risk in concurrent environments; acceptable for current scale.
        all_jobs = db.query(HprJob.job_id).all()
        max_seq = 0
        for (jid,) in all_jobs:
            if jid:
                m = re.match(r"^J(\d+)$", jid)
                if m:
                    max_seq = max(max_seq, int(m.group(1)))
        next_new_seq = max_seq + 1

        for machine_str, m_dict in payload.hourly.items():
            machine_no = int(machine_str)

            # 2. Build time-sorted list of entries with non-null bottle_id
            entries = []
            for time_str, entry_data in m_dict.items():
                if entry_data.bottle_id is None:
                    continue

                parsed_time = _slot_time(time_str)
                entry_dt = datetime.combine(p_date, parsed_time)
                old_jid, old_bottle_id = old_job_snapshot.get((machine_no, parsed_time), (None, None))

                entries.append({
                    "time_str": time_str,
                    "production_time": entry_dt,
                    "map_key": (machine_no, parsed_time),
                    "bottle_id": entry_data.bottle_id,
                    "old_job_id": old_jid,
                    "old_bottle_id": old_bottle_id,
                })

            if not entries:
                continue

            # Sort chronologically by production_time
            entries.sort(key=lambda x: x["production_time"])

            # 3. Group into CONTIGUOUS runs where bottle_id is the same as immediately preceding entry
            runs = []
            current_run = []
            current_bottle_id = None
            for item in entries:
                if item["bottle_id"] == current_bottle_id:
                    current_run.append(item)
                else:
                    if current_run:
                        runs.append(current_run)
                    current_bottle_id = item["bottle_id"]
                    current_run = [item]
            if current_run:
                runs.append(current_run)

            # 4, 5, 6. Determine canonical job_id, overwrite ORM entries, and compute run metadata
            computed_runs = []
            for run in runs:
                run_bottle_id = run[0]["bottle_id"]
                # Reuse an old job id ONLY when it still belongs to this same
                # bottle. A row whose bottle changed starts a fresh job, so the
                # hpr_job row always describes the bottle actually running.
                old_jids = [
                    item["old_job_id"] for item in run
                    if item["old_job_id"] and item["old_bottle_id"] == run_bottle_id
                ]
                unique_old_jids = list(dict.fromkeys(old_jids))

                if unique_old_jids:
                    # 4a. Existing run: agree or chronologically earliest
                    canonical_job_id = unique_old_jids[0]
                    if len(unique_old_jids) > 1:
                        logger.warning(
                            f"Run on machine {machine_no} spans multiple distinct old job_ids: {unique_old_jids}. "
                            f"Using chronologically earliest '{canonical_job_id}' as canonical."
                        )
                else:
                    # 4b. Brand-new run: generate next sequential job_id using the request-scoped counter.
                    # Format matches 'J{:03d}' (e.g. J001, J002).
                    canonical_job_id = f"J{next_new_seq:03d}"
                    next_new_seq += 1

                # 5. Overwrite job_id on every ORM entry in this run
                for item in run:
                    orm_entry = entry_map.get(item["map_key"])
                    if orm_entry:
                        orm_entry.job_id = canonical_job_id

                # 6. Compute job_start_time, job_end_candidate, and bottle_id
                job_start_time = min(e["production_time"] for e in run)
                job_end_candidate = max(e["production_time"] for e in run)
                bottle_id = run_bottle_id

                computed_runs.append({
                    "canonical_job_id": canonical_job_id,
                    "job_start_time": job_start_time,
                    "job_end_candidate": job_end_candidate,
                    "bottle_id": bottle_id,
                })

            # 6. Per machine, the run with the latest job_start_time is RUNNING; all others COMPLETED
            latest_start = max(r["job_start_time"] for r in computed_runs)
            for r in computed_runs:
                if r["job_start_time"] == latest_start:
                    r["status"] = "RUNNING"
                    r["job_end_time"] = None
                else:
                    r["status"] = "COMPLETED"
                    r["job_end_time"] = r["job_end_candidate"]

            # 6.5 Retire the job that is still marked RUNNING for this machine.
            # hpr.hpr_job carries a partial unique index,
            # uq_production_job_one_running_per_machine (machine_no) WHERE
            # status = 'RUNNING', so the database allows only ONE running job per
            # machine. A run that starts on a machine whose previous job was never
            # closed (e.g. J001 from an earlier day) would be rejected outright,
            # and because everything commits together the WHOLE day's data would
            # be rolled back. Close the stale job first, and flush that close so
            # it reaches the database before the new row is inserted.
            running_ids = [r["canonical_job_id"] for r in computed_runs if r["status"] == "RUNNING"]
            if running_ids:
                new_job_start = min(
                    r["job_start_time"] for r in computed_runs if r["status"] == "RUNNING"
                )
                stale_jobs = (
                    db.query(HprJob)
                    .filter(
                        HprJob.machine_no == machine_no,
                        HprJob.status == "RUNNING",
                        HprJob.job_id.notin_(running_ids),
                    )
                    .all()
                )
                for stale_job in stale_jobs:
                    stale_job.status = "COMPLETED"
                    if stale_job.job_end_time is None and new_job_start >= stale_job.job_start_time:
                        stale_job.job_end_time = new_job_start
                if stale_jobs:
                    db.flush()

            # 7. Upsert into hpr_job by canonical_job_id
            for r in computed_runs:
                c_job_id = r["canonical_job_id"]
                existing_job = db.query(HprJob).filter_by(job_id=c_job_id).first()
                if not existing_job:
                    new_job = HprJob(
                        job_id=c_job_id,
                        machine_no=machine_no,
                        bottle_id=r["bottle_id"],
                        job_start_time=r["job_start_time"],
                        job_end_time=r["job_end_time"],
                        status=r["status"],
                        remarks=None,
                    )
                    db.add(new_job)
                else:
                    if existing_job.machine_no == machine_no and existing_job.bottle_id == r["bottle_id"]:
                        existing_job.job_start_time = min(existing_job.job_start_time, r["job_start_time"])
                        existing_job.status = r["status"]
                        existing_job.job_end_time = r["job_end_time"]
                    else:
                        logger.warning(
                            f"Job ID collision for job_id '{c_job_id}': "
                            f"existing (machine={existing_job.machine_no}, bottle={existing_job.bottle_id}) vs "
                            f"conflicting (machine={machine_no}, bottle={r['bottle_id']}). Skipping update."
                        )

        # Step 5: Single Commit
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        # Nothing was persisted — roll back first, then log the full failure
        # server-side and tell the caller exactly what happened so the UI can
        # report it instead of pretending the day was saved.
        db.rollback()
        logger.exception(
            "Quality save failed for %s — transaction rolled back, no rows persisted",
            payload.production_date,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"Quality data for {payload.production_date} was NOT saved "
                f"(the transaction was rolled back): {e}"
            ),
        )

    # Return using explicit re-query
    return get_daily_quality(payload.production_date, db)
