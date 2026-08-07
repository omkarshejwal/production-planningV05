import requests

try:
    response = requests.get('http://127.0.0.1:8000/api/production/jobs/')
    jobs = response.json()
    
    if not jobs:
        print('No jobs found in the database.')
    else:
        print(f'Total jobs in database: {len(jobs)}')
        print('\nRecent jobs added:')
        
        recent_jobs = jobs[-10:] if len(jobs) > 10 else jobs
        
        for j in recent_jobs:
            mch = j.get('machine_no')
            dt = j.get('plan_date')
            bid = j.get('bottle_id')
            qty = j.get('quantity')
            print(f'Machine: MAC-0{mch}, Date: {dt}, Bottle ID: {bid}, Qty: {qty}')
            
        machines_present = set([j.get('machine_no') for j in jobs])
        print(f'\nMachines with at least one job in the database: {sorted(list(machines_present))}')
except Exception as e:
    print('Error connecting to backend:', e)
