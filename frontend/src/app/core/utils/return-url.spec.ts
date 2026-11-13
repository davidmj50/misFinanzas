import { safeReturnUrl } from './return-url';
describe('Destino después de iniciar sesión', () => {
  it.each(['https://example.test', '//example.test', '/\\example.test', '/authentication/login'])('descarta destinos externos o circulares: %s', value => expect(safeReturnUrl(value)).toBe('/dashboard'));
  it('conserva el acceso rápido con su tipo de movimiento', () => expect(safeReturnUrl('/quick-entry?type=INCOME')).toBe('/quick-entry?type=INCOME'));
});
