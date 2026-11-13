import { detectDelimiter, guessMapping, normalizeImportRows, parseCsv, parseImportAmount, parseImportDate, readImportFile } from './import-file';

describe('Lectura de extractos', () => {
  it('lee BOM, comillas escapadas, saltos dentro de celdas y CRLF', () => {
    const input = '\uFEFFFecha;Monto;Descripción\r\n2026-11-12;-100;"Café; \\\"local\\\""';
    const rows = parseCsv('\uFEFFFecha;Monto;Descripción\r\n2026-11-12;-100;"Café; ""local""\nsegunda línea"\r\n', ';');
    expect(rows).toEqual([['Fecha', 'Monto', 'Descripción'], ['2026-11-12', '-100', 'Café; "local"\nsegunda línea']]);
    expect(detectDelimiter(input)).toBe(';');
    expect(detectDelimiter('Fecha,Monto,"Texto; interno"\n')).toBe(',');
  });

  it('rechaza CSV con comillas sin cerrar o texto después del cierre', () => {
    expect(() => parseCsv('a;b\n"sin cerrar', ';')).toThrow();
    expect(() => parseCsv('a;b\n"valor"extra;10', ';')).toThrow();
  });

  it('interpreta fechas de calendario con formato explícito', () => {
    expect(parseImportDate('12/11/2026', 'DMY')).toBe('2026-11-12');
    expect(parseImportDate('12/11/2026', 'MDY')).toBe('2026-12-11');
    expect(parseImportDate('2026-11-12', 'ISO')).toBe('2026-11-12');
    expect(parseImportDate(new Date('2026-11-12T00:00:00Z'), 'DMY')).toBe('2026-11-12');
    expect(() => parseImportDate('30/02/2026', 'DMY')).toThrow();
    expect(() => parseImportDate('29/02/2025', 'DMY')).toThrow();
  });

  it('interpreta separadores, signos y paréntesis sin confundir miles y decimales', () => {
    expect(parseImportAmount('-$ 1.234,56', ',')).toBe(-1234.56);
    expect(parseImportAmount('(1,234.56)', '.')).toBe(-1234.56);
    expect(parseImportAmount(1234.56, ',')).toBe(1234.56);
    for (const invalid of ['1,234.56', '1.000,123', '12.34,56', 'importe 100', '0', '']) expect(() => parseImportAmount(invalid, ',')).toThrow();
    expect(() => parseImportAmount(1.001, ',')).toThrow();
  });

  it('normaliza filas, conserva sus números originales y excluye filas vacías', () => {
    const data = [['Fecha', 'Monto', 'Descripción'], ['2026-11-12', '-1.234,56', 'Comida'], [], ['2026-11-13', '2.000', 'Sueldo']];
    const rows = normalizeImportRows(data, 1, guessMapping(data[0]), []);
    expect(rows.map(r => r.rowId)).toEqual([2, 4]);
    expect(rows[0].payload).toMatchObject({ date: '2026-11-12', type: 'EXPENSE', amount: 1234.56 });
    expect(rows[1].payload).toMatchObject({ type: 'INCOME', amount: 2000 });
  });

  it('respeta Tipo o la configuración de todos gastos y detecta errores por fila', () => {
    const data = [['Fecha', 'Monto', 'Tipo'], ['2026-11-12', '100', 'Cargo'], ['fecha mala', '200', 'otro']];
    const mapping = guessMapping(data[0]);
    expect(normalizeImportRows(data, 1, mapping, [])[0].payload?.type).toBe('EXPENSE');
    expect(normalizeImportRows(data, 1, mapping, [])[1].errors).toHaveLength(2);
    mapping.type = -1; mapping.typeMode = 'EXPENSE';
    expect(normalizeImportRows(data, 1, mapping, [])[0].payload?.type).toBe('EXPENSE');
  });

  it('señala una categoría inexistente en lugar de crearla silenciosamente', () => {
    const data = [['Fecha', 'Monto', 'Categoría'], ['2026-11-12', '-100', 'No existe']];
    const row = normalizeImportRows(data, 1, guessMapping(data[0]), [])[0];
    expect(row.payload).toBeUndefined(); expect(row.errors[0]).toContain('Categoría');
  });

  it('limita a 500 filas y rechaza archivos demasiado grandes o formatos antiguos', async () => {
    const data = [['Fecha', 'Monto'], ...Array.from({ length: 501 }, () => ['2026-11-12', '1'])];
    expect(() => normalizeImportRows(data, 1, guessMapping(data[0]), [])).toThrow('500');
    await expect(readImportFile(new File(['x'], 'extracto.xls'))).rejects.toThrow('CSV');
    await expect(readImportFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'extracto.csv'))).rejects.toThrow('2 MB');
  });
});
