import { inject } from '@angular/core';
import { QuickDraftStore } from './quick-draft.store';
import { safeReturnUrl } from '../utils/return-url';
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, LoginPayload, RegisterPayload } from '../models/auth.models';

const TOKEN_KEY = 'misfinanzas_token';
const USER_KEY = 'misfinanzas_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly drafts = inject(QuickDraftStore);
  private readonly currentUserSignal = signal<AuthUser | null>(this.readStoredUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUserSignal());
  readonly isAdmin = computed(() => this.currentUserSignal()?.role === 'ADMIN');

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  login(payload: LoginPayload) {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, payload).pipe(
      tap((response) => this.setSession(response)),
    );
  }

  register(payload: RegisterPayload) {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, payload).pipe(
      tap((response) => this.setSession(response)),
    );
  }

  updateUser(user: AuthUser) {
    if (!this.isAuthenticated() || user.id !== this.currentUser()?.id) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUserSignal.set(user);
  }

  refreshUser() {
    return this.http.get<AuthUser>(`${environment.apiUrl}/auth/me`).pipe(tap(user => this.updateUser(user)));
  }

  logout(clearDrafts = true, returnUrl?: string) {
    const token = this.getToken();
    if (clearDrafts) this.drafts.clearAll();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUserSignal.set(null);
    if (clearDrafts && token) this.http.post(`${environment.apiUrl}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }).subscribe({ error: () => undefined });
    if (returnUrl) this.router.navigate(['/authentication/login'], { queryParams: { returnUrl: safeReturnUrl(returnUrl) } });
    else this.router.navigate(['/authentication/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private setSession(response: AuthResponse) {
    this.drafts.keepOnly(response.user.id);
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.currentUserSignal.set(response.user);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
