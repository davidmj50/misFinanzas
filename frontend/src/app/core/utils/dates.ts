/**
 * Fecha local "YYYY-MM-DD". No usar `toISOString()` para esto: convierte a UTC y
 * en Colombia (UTC-5), después de las 7 p. m., devuelve la fecha de mañana.
 */
export function localDateString(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
