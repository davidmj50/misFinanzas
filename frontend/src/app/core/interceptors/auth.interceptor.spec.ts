import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';
describe('Peticiones privadas en la aplicación instalable', () => {
  const setup = () => { const auth = { getToken: () => 'test-token', isAuthenticated: () => true, logout: vi.fn() }; TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }, { provide: Router, useValue: { url: '/quick-entry' } }] }); return auth; };
  it('envía la API directamente y añade autenticación', () => {
    setup(); const next = vi.fn((_request: HttpRequest<unknown>) => of(new HttpResponse()));
    TestBed.runInInjectionContext(() => authInterceptor(new HttpRequest('GET', environment.apiUrl + '/accounts'), next)).subscribe();
    const request = next.mock.calls[0][0] as HttpRequest<unknown>;
    expect(request.headers.get('ngsw-bypass')).toBe('true'); expect(request.headers.get('Authorization')).toBe('Bearer test-token');
  });
  it('no añade el token ni parámetros de la PWA a otros dominios', () => {
    setup(); const next = vi.fn((_request: HttpRequest<unknown>) => of(new HttpResponse()));
    TestBed.runInInjectionContext(() => authInterceptor(new HttpRequest('GET', 'https://example.test/image'), next)).subscribe();
    const request = next.mock.calls[0][0] as HttpRequest<unknown>; expect(request.headers.has('Authorization')).toBe(false); expect(request.headers.has('ngsw-bypass')).toBe(false);
  });
  it('mantiene el borrador y el destino del formulario cuando expira la sesión', () => {
    const auth = setup(); const next = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    TestBed.runInInjectionContext(() => authInterceptor(new HttpRequest('GET', environment.apiUrl + '/accounts'), next)).subscribe({ error: () => {} });
    expect(auth.logout).toHaveBeenCalledWith(false, '/quick-entry');
  });
});
