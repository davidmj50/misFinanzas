import { parseReceipt, receiptAmount } from './receipt-parser';
describe('Lectura de datos de comprobantes', () => {
  it.each([['12.500,50', 12500.5], ['12,500.50', 12500.5], ['12500', 12500], ['12.500', 12500], ['12 500,50', 12500.5], ['12,5', 12.5]])('interpreta %s sin cambiar su valor', (text, expected) => expect(receiptAmount(text)).toBe(expected));
  it.each(['-20', '0', '1.00.2', '12,34,56', '12345 67', '123.4567'])('rechaza importes ambiguos o no válidos: %s', value => expect(receiptAmount(value)).toBeNull());
  it('extrae una factura colombiana y prefiere el total a pagar frente al subtotal', () => {
    expect(parseReceipt('SUPERMERCADO PRUEBA\nNIT 900123456\nFecha: 13/11/2026\nSubtotal 10.000,00\nIVA 1.900,00\nTOTAL A PAGAR COP 11.900,00')).toMatchObject({ date: '2026-11-13', merchant: 'SUPERMERCADO PRUEBA', amount: 11900, currency: 'COP' });
  });
  it('no confunde IVA, descuento o vencimiento con los campos solicitados', () => {
    const parsed = parseReceipt('Comercio: Tienda prueba\nFecha emisión: 2026-11-13\nVencimiento: 2026-12-13\nTOTAL IVA 19,00\nTOTAL DESCUENTO 5,00\nTOTAL 100,00');
    expect(parsed).toMatchObject({ date: '2026-11-13', merchant: 'Tienda prueba', amount: 100 });
  });
  it('deja el total vacío si hay varios totales distintos del mismo nivel', () => {
    expect(parseReceipt('Tienda\nTOTAL 100,00\nTOTAL 200,00').amount).toBeNull();
    expect(parseReceipt('Tienda\nEfectivo 500,00\nCambio 100,00').amount).toBeNull();
  });
  it('permite elegir día/mes o mes/día y avisa de la ambigüedad', () => {
    expect(parseReceipt('Fecha 03/04/2026').date).toBe('2026-04-03');
    expect(parseReceipt('Fecha 03/04/2026', 'MDY').date).toBe('2026-03-04');
    expect(parseReceipt('Fecha 03/04/2026').warnings.join(' ')).toContain('día/mes/año');
  });
  it('reconoce meses escritos y rechaza fechas imposibles', () => {
    expect(parseReceipt('Fecha: 13 de noviembre de 2026').date).toBe('2026-11-13');
    expect(parseReceipt('Fecha: 30/02/2026').date).toBeNull();
  });
  it('identifica un total en la siguiente línea y no interpreta $ como una moneda concreta', () => {
    expect(parseReceipt('Mercado prueba\nTOTAL A PAGAR\n$ 12500')).toMatchObject({ amount: 12500, currency: null });
  });
});
