// Two-line report header printed at the top of every exported / printed report
// in the Production Planning and Quality Control modules.
//
//   Line 1: Empire Industries Limited - Vitrum Glass - Mumbai
//   Line 2: Monthly Production Plan - <Month> <Year>
//
// The month/year on line 2 is always derived from the reporting period that is
// currently in view, so it stays correct when the user changes the date range
// or the reporting month.

export const COMPANY_NAME = 'Empire Industries Limited - Vitrum Glass - Mumbai';

export const REPORT_TITLE_PREFIX = 'Monthly Production Plan';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Resolves a reporting period anchor into its calendar month/year.
 * Accepts a Date, or an ISO string ("YYYY-MM-DD" / "YYYY-MM").
 * ISO strings are parsed textually so no timezone shift can occur.
 */
const toMonthParts = (value: Date | string): { month: number; year: number } => {
  if (value instanceof Date) {
    return { month: value.getMonth() + 1, year: value.getFullYear() };
  }

  const [yearPart, monthPart] = String(value).split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const today = new Date();
    return { month: today.getMonth() + 1, year: today.getFullYear() };
  }

  return { month, year };
};

/** "September 2026" for the supplied reporting period. */
export const formatReportMonth = (value: Date | string): string => {
  const { month, year } = toMonthParts(value);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

/** The dynamic second header line, e.g. "Monthly Production Plan - September 2026". */
export const formatReportTitle = (value: Date | string): string =>
  `${REPORT_TITLE_PREFIX} - ${formatReportMonth(value)}`;

/** Both header lines, in print order. */
export const getReportHeaderLines = (
  value: Date | string
): { company: string; title: string } => ({
  company: COMPANY_NAME,
  title: formatReportTitle(value),
});
