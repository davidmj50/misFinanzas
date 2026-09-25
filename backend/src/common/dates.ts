// Las fechas de transacciones, aportes y metas son fechas de calendario: se guardan como
// medianoche UTC del día (así las envía el frontend, "2026-09-30" -> 2026-09-30T00:00:00Z).
// Por eso se leen siempre con los getters UTC, sin depender de la zona horaria del servidor.
// Lo único que sí depende de la zona del usuario es saber qué día es "hoy".

const DAY_MS = 24 * 60 * 60 * 1000;

export function appTimeZone() {
  return process.env.APP_TIME_ZONE || 'America/Bogota';
}

/** Fecha de calendario (mes 0-11) como medianoche UTC. Acepta días/meses fuera de rango como Date.UTC. */
export function utcDate(year: number, month: number, day = 1) {
  return new Date(Date.UTC(year, month, day));
}

/** Hoy en la zona horaria de la app, como medianoche UTC. */
export function today(now = new Date(), timeZone = appTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return utcDate(get('year'), get('month') - 1, get('day'));
}

/** Rango [start, end) del mes actual desplazado `offset` meses (-1 = mes anterior). */
export function monthRange(offset = 0, now = new Date()) {
  const t = today(now);
  return {
    start: utcDate(t.getUTCFullYear(), t.getUTCMonth() + offset, 1),
    end: utcDate(t.getUTCFullYear(), t.getUTCMonth() + offset + 1, 1),
  };
}

/** Clave "YYYY-MM" del mes de una fecha de calendario. */
export function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" de una fecha de calendario. */
export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function daysInMonth(year: number, month: number) {
  return utcDate(year, month + 1, 0).getUTCDate();
}
