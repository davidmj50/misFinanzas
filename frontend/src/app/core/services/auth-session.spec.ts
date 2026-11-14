import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
describe('Cierre y actualización de identidad', () => {
  let http: HttpTestingController, auth: AuthService;
  const user = {
    id: 'owner',
    name: 'Persona',
    email: 'correo@test',
    role: 'USER',
    emailVerifiedAt: null,
  };
  beforeEach(() => {
    localStorage.setItem('misfinanzas_token', 'snapshot-token');
    localStorage.setItem('misfinanzas_user', JSON.stringify(user));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => {
    http.verify();
    localStorage.removeItem('misfinanzas_token');
    localStorage.removeItem('misfinanzas_user');
  });
  it('borra credenciales aunque el cierre remoto falle y usa el token anterior', () => {
    auth.logout();
    expect(auth.getToken()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    const req = http.expectOne(environment.apiUrl + '/auth/logout');
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer snapshot-token',
    );
    req.flush({}, { status: 503, statusText: 'Unavailable' });
  });
  it('no intenta revocar en línea una sesión vencida', () => {
    auth.logout(false, '/quick-entry');
    http.expectNone(environment.apiUrl + '/auth/logout');
  });
  it('actualiza el estado de verificación sin mezclar usuarios', () => {
    auth.refreshUser().subscribe();
    http
      .expectOne(environment.apiUrl + '/auth/me')
      .flush({ ...user, emailVerifiedAt: '2026-11-14T00:00:00Z' });
    expect(auth.currentUser()?.emailVerifiedAt).toBeTruthy();
    auth.updateUser({ ...user, id: 'another', role: 'USER' });
    expect(auth.currentUser()?.id).toBe('owner');
  });
});
