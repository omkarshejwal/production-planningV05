function addCalendarDays(date, days) {
  const nextDate = new Date(date);
  if (!Number.isFinite(days) || days === 0) return nextDate;

  const wholeDays = days >= 0 ? Math.floor(days) : Math.ceil(days);
  const fractionalDays = days - wholeDays;

  nextDate.setDate(nextDate.getDate() + wholeDays);
  if (fractionalDays !== 0) {
    nextDate.setMinutes(nextDate.getMinutes() + fractionalDays * 24 * 60);
  }
  return nextDate;
}

const fromDateIso = '2026-08-01';
const toDateIso = '2026-08-31';

const startD = new Date(fromDateIso + 'T00:00:00');
const endD = new Date(toDateIso + 'T00:00:00');

// Mock previous job on 2026-07-31
const rawPreviousJobs = [{ plan_date: '2026-07-31' }];

let earliestDate = new Date(startD);
for (const pJob of rawPreviousJobs) {
    if (pJob.plan_date) {
        const pDate = new Date(pJob.plan_date + 'T00:00:00'); 
        if (pDate < earliestDate) {
            earliestDate = pDate;
        }
    }
}

const allDateRows = [];
let curr = new Date(earliestDate);
while (curr <= endD) {
    const iso = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
    const label = curr.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    allDateRows.push({ iso, label, dateObj: new Date(curr) });
    curr = addCalendarDays(curr, 1);
}

for (let rowIdx = 0; rowIdx < allDateRows.length; rowIdx++) {
    const dateInfo = allDateRows[rowIdx];
    console.log(`[DEBUG_FILTER] dateInfo.iso: "${dateInfo.iso}", label: "${dateInfo.label}", fromDateIso: "${fromDateIso}", skipped: ${dateInfo.iso < fromDateIso || dateInfo.iso > toDateIso}`);
}
