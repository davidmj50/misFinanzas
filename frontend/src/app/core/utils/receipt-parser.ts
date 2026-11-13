export interface ReceiptSuggestions { date: string | null; merchant: string | null; amount: number | null; currency: string | null; warnings: string[]; }
const norm = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
function calendarDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2099 && value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day ? value.toISOString().slice(0, 10) : null;
}
export function receiptAmount(input: string): number | null {
  let text = input.trim().replace(/\u00a0/g, ' ');
  if (!/^\d[\d., ]*$/.test(text)) return null;
  if (text.includes(' ')) {
    if (!/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(text)) return null;
    text = text.replaceAll(' ', '');
  }
  const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
  let decimal = '';
  if (comma >= 0 && dot >= 0) decimal = comma > dot ? ',' : '.';
  else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? ',' : '.';
    const parts = text.split(separator);
    if (parts.length === 2 && parts[1].length <= 2) decimal = separator;
    else if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(text)) return null;
  }
  if (decimal) {
    const grouping = decimal === ',' ? '.' : ',';
    const parts = text.split(decimal);
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
    if (parts[0].includes(grouping) && !new RegExp('^\\d{1,3}(?:\\' + grouping + '\\d{3})+$').test(parts[0])) return null;
    text = parts[0].replaceAll(grouping, '') + '.' + parts[1];
  } else text = text.replace(/[.,]/g, '');
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 && amount <= 999999999999.99 ? amount : null;
}
export function parseReceipt(text: string, dateFormat: 'DMY' | 'MDY' = 'DMY'): ReceiptSuggestions {
  const lines = text.slice(0, 50000).split(/\r?\n/).map(s => s.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim()).filter(Boolean);
  const warnings: string[] = [];
  const dates: { value: string; score: number; ambiguous: boolean }[] = [];
  for (const line of lines) {
    if (/vencimiento|expiry|expiration|due date/i.test(norm(line))) continue;
    const score = /fecha|date|emision/i.test(norm(line)) ? 2 : 1;
    for (const match of line.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/g)) {
      const iso = !!match[1];
      const year = iso ? +match[1] : +match[6] < 100 ? 2000 + +match[6] : +match[6];
      const a = +(iso ? match[2] : match[4]), b = +(iso ? match[3] : match[5]);
      const month = iso || dateFormat === 'MDY' ? a : b, day = iso || dateFormat === 'MDY' ? b : a;
      const value = calendarDate(year, month, day);
      if (value) dates.push({ value, score, ambiguous: !iso && a <= 12 && b <= 12 && a !== b });
    }
    const names = norm(line).match(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})\b/);
    if (names) {
      const month = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'].indexOf(names[2]) + 1;
      const value = calendarDate(+names[3], month, +names[1]); if (value) dates.push({ value, score, ambiguous: false });
    }
  }
  dates.sort((a, b) => b.score - a.score);
  const bestDates = dates.filter(d => d.score === dates[0]?.score);
  const date = new Set(bestDates.map(d => d.value)).size === 1 ? bestDates[0]?.value ?? null : null;
  if (date && bestDates.some(d => d.ambiguous)) warnings.push(`Fecha numérica interpretada como ${dateFormat === 'DMY' ? 'día/mes/año' : 'mes/día/año'}; compruébala.`);
  const amounts: { value: number; score: number }[] = [];
  for (const [index, line] of lines.entries()) {
    const normalized = norm(line);
    if (/sub\s*total|total\s*(?:iva|impuesto|descuento)|total\s*de\s*(?:impuestos|descuentos)/.test(normalized)) continue;
    const label = /\b(total\s*a\s*pagar|valor\s*total|importe\s*total|gran\s*total|total\s*venta|total\s*facturado|neto\s*a\s*pagar|grand\s*total|amount\s*due|total\s*paid|total)\b/.exec(normalized);
    if (!label) continue;
    let remaining = line.slice(label.index + label[0].length).replace(/^\s*[:=]\s*/, '');
    if (!/\d/.test(remaining)) remaining = lines[index + 1] ?? '';
    const token = remaining.match(/[+-]?\d[\d.,\u00a0 ]*\d|[+-]?\d/);
    if (token && !remaining.includes('(')) { const value = receiptAmount(token[0]); if (value !== null) amounts.push({ value, score: label[1] === 'total' ? 1 : 2 }); }
  }
  amounts.sort((a, b) => b.score - a.score);
  const bestAmounts = amounts.filter(a => a.score === amounts[0]?.score);
  const amount = new Set(bestAmounts.map(a => a.value)).size === 1 ? bestAmounts[0]?.value ?? null : null;
  const explicitMerchant = lines.map(line => /^(?:comercio|establecimiento|raz[oó]n social|merchant|vendedor)\s*[:=]\s*(.+)$/i.exec(line)?.[1]).find(Boolean);
  const merchant = (explicitMerchant ?? lines.slice(0, 8).find(line => /\p{L}{3}/u.test(line) && !/factura|recibo|receipt|ticket|nit\b|rfc\b|ruc\b|direccion|direcc|calle|carrera|telefono|tel\b|fecha|date\b|total|iva\b|https?:|@|bienvenido|gracias|welcome|pago|efectivo|tarjeta/i.test(norm(line))))?.slice(0, 200) ?? null;
  const currencies = [...new Set(norm(lines.join(' ')).match(/\b(?:cop|usd|eur|mxn|pen|clp|ars|brl)\b/g)?.map(s => s.toUpperCase()) ?? [])];
  if (!date) warnings.push('No se pudo identificar una fecha única y válida.');
  if (!amount) warnings.push('No se pudo identificar un total único; revisa el importe.');
  if (!merchant) warnings.push('No se pudo identificar el comercio.');
  if (currencies.length > 1) warnings.push('El documento menciona varias monedas.');
  return { date, amount, merchant, currency: currencies.length === 1 ? currencies[0] : null, warnings };
}
