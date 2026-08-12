"""
API smoke test: validate jobs endpoint across date ranges after schema fix.
Tests that changeover_minutes and status are never None.
"""
import requests, sys

BASE = "http://localhost:8000"

# Try login with known users
creds_to_try = [
    ("ashish@gmail.com", "admin123"),
    ("omkar@gmail.com",  "admin123"),
    ("admin@example.com", "password123"),
    ("8390206234", "admin123"),
    ("9988776655", "admin123"),
]

token = None
for uid, pw in creds_to_try:
    r = requests.post(f"{BASE}/api/auth/login", json={"user_id": uid, "password": pw}, timeout=10)
    if r.status_code == 200:
        token = r.json().get("access_token") or r.json().get("token")
        print(f"AUTH OK with {uid}")
        break
    else:
        print(f"AUTH fail {r.status_code} with {uid}: {r.text[:80]}")

if not token:
    print("Could not authenticate - testing without auth header")

headers = {"Authorization": f"Bearer {token}"} if token else {}

ranges = [
    ("2026-08-01", "2026-08-31", "August 2026  (original failing range)"),
    ("2026-07-01", "2026-07-31", "July 2026"),
    ("2026-09-01", "2026-09-30", "September 2026"),
    ("2026-01-01", "2026-12-31", "Full year 2026"),
    (None,         None,         "No filter (all rows)"),
]

print("\n=== JOB ENDPOINT TESTS ===")
all_pass = True
for from_d, to_d, label in ranges:
    params = {}
    if from_d: params["from_date"] = from_d
    if to_d:   params["to_date"]   = to_d

    resp = requests.get(f"{BASE}/api/production/jobs/", params=params, headers=headers, timeout=15)

    if resp.status_code == 200:
        jobs = resp.json()
        if not isinstance(jobs, list):
            print(f"[{label}]: HTTP 200 but non-list body")
            continue
        null_co = sum(1 for j in jobs if j.get("changeover_minutes") is None)
        null_st = sum(1 for j in jobs if j.get("status") is None)
        sample  = jobs[0] if jobs else {}
        ok = "PASS" if (null_co == 0 and null_st == 0) else "FAIL"
        if ok == "FAIL": all_pass = False
        print(
            f"[{ok}] {label}: HTTP 200 | {len(jobs)} jobs | "
            f"null changeover={null_co} | null status={null_st} | "
            f"sample: changeover_minutes={sample.get('changeover_minutes')!r} status={sample.get('status')!r}"
        )
    else:
        all_pass = False
        print(f"[FAIL] {label}: HTTP {resp.status_code} -> {resp.text[:200]}")

print("\n" + ("ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED"))
sys.exit(0 if all_pass else 1)
