/** Parse report date range; default = current calendar month (local). */
export function resolveReportPeriod(
  startDate?: string | null,
  endDate?: string | null,
): { start: Date; end: Date } {
  const now = new Date();

  let start: Date;
  let end: Date;

  if (startDate) {
    start = new Date(startDate);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  if (endDate) {
    end = new Date(endDate);
    // If date-only (YYYY-MM-DD), include the full day
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
      end.setHours(23, 59, 59, 999);
    }
  } else {
    end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  }

  if (Number.isNaN(start.getTime())) {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
  if (Number.isNaN(end.getTime())) {
    end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  }

  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
