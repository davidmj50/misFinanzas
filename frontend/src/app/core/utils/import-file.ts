import { Category, TransactionType } from '../models/finance.models';
import { ImportRow } from '../models/import.models';

export type Cell = string | number | boolean | Date | null;
export interface ImportSheet { name: string; data: Cell[][]; }
export type DateFormat = 'ISO' | 'DMY' | 'MDY';
export interface ImportMapping {
  date: number; amount: number; type: number; description: number; merchant: number;
  category: number; currency: number; externalRef: number;
  dateFormat: DateFormat; decimal: ',' | '.'; typeMode: 'SIGNED' | TransactionType;
}
export interface ParsedImportRow { rowId: number; payload?: ImportRow; errors: string[]; }

export function parseCsv(text: string, delimiter: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closedQuote = false;
  const pushRow = () => { row.push(cell); rows.push(row); row = []; cell = ''; closedQuote = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (char === '"' && !cell && !closedQuote) quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; closedQuote = false; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (closedQuote && char.trim()) throw new Error('CSV inválido: hay texto después del cierre de comillas.');
    else if (char === '"') throw new Error('CSV inválido: las comillas deben encerrar la celda completa.');
    else if (!closedQuote) cell += char;
    if (rows.length > 2000) throw new Error('El archivo tiene demasiadas filas. Importa hasta 500 movimientos por archivo.');
  }
  if (quoted) throw new Error('CSV inválido: faltan comillas de cierre.');
  if (cell || row.length || closedQuote) pushRow();
  return rows;
}

export function detectDelimiter(text: string): string {
  const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') i++;
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\r' || ch === '\n')) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export async function readImportFile(file: File, delimiter = 'auto', encoding = 'utf-8'): Promise<ImportSheet[]> {
  if (file.size > 2 * 1024 * 1024) throw new Error('El archivo supera 2 MB. Divide el extracto en archivos más pequeños.');
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readExcel } = await import('read-excel-file/browser');
    const sheets = await readExcel(file);
    const cellValue = (value: unknown): Cell => {
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;
      throw new Error('El archivo contiene un tipo de celda no admitido.');
    };
    return sheets.map(sheet => ({ name: sheet.sheet, data: sheet.data.map(row => row.map(cellValue)) }));
  }
  if (!/\.(csv|tsv)$/i.test(file.name)) throw new Error('Selecciona un archivo CSV, TSV o XLSX.');
  const text = new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(await file.arrayBuffer());
  return [{ name: file.name, data: parseCsv(text, delimiter === 'auto' ? detectDelimiter(text) : delimiter) }];
}

export function parseImportDate(cell: Cell, format: DateFormat): string {
  if (cell instanceof Date && Number.isFinite(cell.getTime())) return cell.toISOString().slice(0, 10);
  const text = String(cell ?? '').trim();
  const match = text.match(format === 'ISO' ? /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/ : /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) throw new Error('Fecha inválida para el formato elegido');
  const year = Number(format === 'ISO' ? match[1] : match[3]);
  const month = Number(format === 'ISO' ? match[2] : format === 'DMY' ? match[2] : match[1]);
  const day = Number(format === 'ISO' ? match[3] : format === 'DMY' ? match[1] : match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('La fecha no existe');
  return date.toISOString().slice(0, 10);
}

export function parseImportAmount(cell: Cell, decimal: ',' | '.'): number {
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || Math.abs(cell) < 0.01 || Math.abs(cell) > 999999999999.99 || Math.abs(cell - Number(cell.toFixed(2))) > 0.0000001) throw new Error('El importe debe ser distinto de cero y tener hasta dos decimales');
    return Math.round(cell * 100) / 100;
  }
  let text = String(cell ?? '').trim().replace(/^(COP|USD|EUR)\s*/i, '').replace(/\s*(COP|USD|EUR)$/i, '').replace(/[$€\s\u00a0]/g, '');
  if (/^\(.+\)$/.test(text)) text = `-${text.slice(1, -1)}`;
  const grouping = decimal === ',' ? '.' : ',';
  const sign = text.startsWith('-') ? '-' : '';
  text = text.replace(/^[+-]/, '');
  const parts = text.split(decimal);
  if (parts.length > 2 || (parts[1] !== undefined && !/^\d{1,2}$/.test(parts[1]))) throw new Error('Formato decimal inválido');
  const groupPattern = grouping === '.' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
  if (!/^\d+$/.test(parts[0]) && !groupPattern.test(parts[0])) throw new Error('Formato del importe inválido');
  return parseImportAmount(Number(`${sign}${parts[0].split(grouping).join('')}${parts[1] ? '.' + parts[1] : ''}`), decimal);
}

const textCell = (cell: Cell | undefined) => cell === null || cell === undefined ? '' : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim();
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function guessMapping(headers: string[]): ImportMapping {
  const find = (names: string[]) => headers.findIndex(h => names.includes(normalized(h)));
  return {
    date: find(['fecha', 'date', 'fecha de movimiento']), amount: find(['monto', 'importe', 'valor', 'amount']),
    type: find(['tipo', 'type']), description: find(['descripcion', 'description', 'concepto', 'detalle']),
    merchant: find(['comercio', 'merchant']), category: find(['categoria', 'category']), currency: find(['moneda', 'currency']),
    externalRef: find(['referencia', 'reference', 'id', 'externalref']), dateFormat: 'ISO', decimal: ',', typeMode: 'SIGNED',
  };
}

export function normalizeImportRows(data: Cell[][], headerRow: number, mapping: ImportMapping, categories: Category[]): ParsedImportRow[] {
  if (mapping.date < 0 || mapping.amount < 0) throw new Error('Asigna las columnas de fecha e importe.');
  const rows = data.slice(headerRow).map((cells, index) => ({ cells, rowId: headerRow + index + 1 })).filter(r => r.cells.some(c => textCell(c) !== ''));
  if (rows.length > 500) throw new Error('Importa hasta 500 movimientos por archivo. Divide el extracto.');
  return rows.map(({ cells, rowId }) => {
    const errors: string[] = [];
    let date = '', amount = 0;
    try { date = parseImportDate(cells[mapping.date] ?? null, mapping.dateFormat); } catch (error) { errors.push((error as Error).message); }
    try { amount = parseImportAmount(cells[mapping.amount] ?? null, mapping.decimal); } catch (error) { errors.push((error as Error).message); }
    let type: TransactionType = mapping.typeMode === 'SIGNED' ? amount < 0 ? 'EXPENSE' : 'INCOME' : mapping.typeMode;
    if (mapping.type >= 0) {
      const value = normalized(textCell(cells[mapping.type]));
      if (['ingreso', 'income', 'abono', 'credito', 'credit'].includes(value)) type = 'INCOME';
      else if (['gasto', 'expense', 'cargo', 'debito', 'debit'].includes(value)) type = 'EXPENSE';
      else errors.push('Tipo inválido: usa Ingreso/Gasto o Abono/Cargo');
    }
    const get = (column: number) => column < 0 ? undefined : textCell(cells[column]) || undefined;
    const categoryName = get(mapping.category);
    let categoryId: string | undefined;
    if (categoryName) {
      const matches = categories.filter(c => c.type === type && normalized(c.name) === normalized(categoryName));
      if (matches.length !== 1) errors.push('Categoría inexistente o ambigua para este tipo');
      else categoryId = matches[0].id;
    }
    const description = get(mapping.description), merchant = get(mapping.merchant), externalRef = get(mapping.externalRef);
    const currency = get(mapping.currency)?.toUpperCase();
    if ((description?.length ?? 0) > 500 || (merchant?.length ?? 0) > 200 || (externalRef?.length ?? 0) > 200) errors.push('Descripción, comercio o referencia demasiado largos');
    if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push('Moneda inválida');
    return { rowId, errors, ...(errors.length ? {} : { payload: { rowId, date, type, amount: Math.abs(amount), description, merchant, externalRef, categoryId, currency } }) };
  });
}
