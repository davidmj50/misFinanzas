import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../models/auth.models';
export interface AccountSession {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}
export interface SecurityState {
  user: AuthUser;
  sessions: AccountSession[];
  emailDeliveryAvailable: boolean;
}
@Injectable({ providedIn: 'root' })
export class AccountSecurityService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl + '/auth';
  state() {
    return this.http.get<SecurityState>(this.base + '/security');
  }
  forgot(email: string) {
    return this.http.post<{ message: string }>(this.base + '/password/forgot', {
      email,
    });
  }
  reset(token: string, newPassword: string) {
    return this.http.post<{ message: string }>(this.base + '/password/reset', {
      token,
      newPassword,
    });
  }
  verify(token: string) {
    return this.http.post<{ message: string }>(this.base + '/email/verify', {
      token,
    });
  }
  resend() {
    return this.http.post<{ message: string }>(this.base + '/email/resend', {});
  }
  change(currentPassword: string, newPassword: string) {
    return this.http.post(this.base + '/password/change', {
      currentPassword,
      newPassword,
    });
  }
  revoke(id: string) {
    return this.http.delete<{ currentSessionClosed: boolean }>(
      this.base + '/sessions/' + encodeURIComponent(id),
    );
  }
  revokeOthers(currentPassword: string) {
    return this.http.post(this.base + '/sessions/revoke-others', {
      currentPassword,
    });
  }
}
export function securityError(error: {
  status?: number;
  error?: { message?: unknown };
}): string {
  if (error.status === 0)
    return 'No hay conexión con el servicio. Revisa tu conexión e inténtalo de nuevo.';
  if (error.status === 429)
    return 'Has realizado varios intentos. Espera unos minutos antes de volver a intentarlo.';
  const message = error.error?.message;
  return typeof message === 'string'
    ? message
    : Array.isArray(message)
      ? message.join(' ')
      : 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}
