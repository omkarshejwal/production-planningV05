"""Look up production.users for login credentials."""
import psycopg2
conn = psycopg2.connect(
    host='vitrum-production.c1mk08k6cmhv.eu-north-1.rds.amazonaws.com',
    port=5432, dbname='production_planning_db',
    user='admin_vitrum', password='Vitrum123', sslmode='require'
)
cur = conn.cursor()
cur.execute('SELECT employee_id, employee_name, email, phone_number, role, is_active, password FROM production.users LIMIT 10')
rows = cur.fetchall()
for r in rows:
    # mask password after first 3 chars
    masked = r[6][:3] + '***' if r[6] else None
    print(f"id={r[0]}, name={r[1]}, email={r[2]}, phone={r[3]}, role={r[4]}, active={r[5]}, pw_prefix={masked}")
cur.close()
conn.close()
