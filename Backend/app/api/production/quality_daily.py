# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select
from datetime import datetime, date
from typing import Dict, Any

from app.db.session import get_db
from app.models.quality import (
    HourlyProductionReport, ShiftAssignment, HourlyProduction,
    DefectMaster, HourlyProductionDefect
)
from app.schemas.quality import QualityDailyRequest, QualityDailyResponse, QualityHourlyEntrySchema, QualityShiftAssignmentSchema
from app.api.auth import get_current_user
from app.models.user import User

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

def _parse_time_string(time_str: str) -> datetime.time:
    return datetime.strptime(time_str, "%I:%M %p").time()

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
def get_daily_quality(date: str, db: Session = Depends(get_db)):
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
        # Reconstruct time string "9:00 AM" etc. Note: windows strftime for no leading zero is %#I, on linux it's %-I
        # Safest way:
        pt_time = entry.production_time.strftime("%I:%M %p").lstrip("0")
        if pt_time.startswith(":"):
            pt_time = "12" + pt_time

        # packing_category is stored as comma separated string? Frontend expects array
        pc = entry.packing_category.split(",") if entry.packing_category else []
        pc = [x.strip() for x in pc if x.strip()]
        
        response.hourly[m][pt_time] = QualityHourlyEntrySchema(
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
    current_user: User = Depends(get_current_user)
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
        entry_map = {(e.machine_no, e.production_time): e for e in existing_entries}

        for machine_str, m_dict in payload.hourly.items():
            machine_no = int(machine_str)
            for time_str, entry_data in m_dict.items():
                parsed_time = _parse_time_string(time_str)
                # handle overnight shifts
                # Shift 3 is 1am to 9am, it actually belongs to the next calendar day
                # But typically production_date stays the same for the whole shift
                # We combine it directly:
                entry_dt = datetime.combine(p_date, parsed_time)
                
                # Check if it exists
                entry = entry_map.get((machine_no, entry_dt))

                # If no row exists yet for this slot, skip if all fields are empty
                if not entry:
                    if not _has_meaningful_data(entry_data):
                        continue
                
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

                if not entry:
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
                        job_id=entry_data.job_id
                    )
                    db.add(entry)
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
                    entry.job_id = entry_data.job_id

                # Step 4: Replace all defects
                entry.defects = [defect_map[dname] for dname in entry_data.defect_ids]

        # Step 5: Single Commit
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    # Return using explicit re-query
    return get_daily_quality(payload.production_date, db)
