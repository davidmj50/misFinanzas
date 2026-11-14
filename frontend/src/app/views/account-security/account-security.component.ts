import { Component, inject, signal, OnInit, LOCALE_ID } from '@angular/core';
import { DatePipe, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AccountSecurityService,
  SecurityState,
  securityError,
  AccountSession,
} from '../../core/services/account-security.service';
import { AuthService } from '../../core/services/auth.service';
import {
  newPasswordValidator,
  matchingPasswords,
} from '../../core/utils/password-policy';

registerLocaleData(localeEs, 'es-CO');

@Component({
  selector: 'app-account-security',
  imports: [ReactiveFormsModule, DatePipe],
  providers: [{ provide: LOCALE_ID, useValue: 'es-CO' }],
  templateUrl: './account-security.component.html',
})
export class AccountSecurityComponent implements OnInit {
  private readonly api = inject(AccountSecurityService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly state = signal<SecurityState | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, newPasswordValidator]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );
  readonly sessionsForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
  });
  ngOnInit() {
    this.load();
  }
  load() {
    this.loading.set(true);
    this.api
      .state()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (state) => {
          this.state.set(state);
          this.auth.updateUser(state.user);
        },
        error: (error) => this.error.set(securityError(error)),
      });
  }
  private start() {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    return true;
  }
  resend() {
    if (!this.start()) return;
    this.api
      .resend()
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (data) => this.message.set(data.message),
        error: (error) => this.error.set(securityError(error)),
      });
  }
  changePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    if (!this.start()) return;
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.api
      .change(currentPassword, newPassword)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.passwordForm.reset();
          this.auth.logout(false);
          void this.router.navigate(['/authentication/login'], {
            queryParams: { passwordChanged: '1' },
          });
        },
        error: (error) => {
          this.passwordForm.controls.currentPassword.reset();
          this.error.set(securityError(error));
        },
      });
  }
  revoke(session: AccountSession) {
    if (
      !confirm(
        session.current
          ? '¿Cerrar la sesión en este dispositivo?'
          : `¿Cerrar la sesión de ${session.label}?`,
      )
    )
      return;
    if (!this.start()) return;
    this.api
      .revoke(session.id)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (result) => {
          if (result.currentSessionClosed) this.auth.logout(false);
          else {
            this.message.set('Sesión cerrada.');
            this.load();
          }
        },
        error: (error) => this.error.set(securityError(error)),
      });
  }
  revokeOthers() {
    if (this.sessionsForm.invalid) {
      this.sessionsForm.markAllAsTouched();
      return;
    }
    if (!this.start()) return;
    this.api
      .revokeOthers(this.sessionsForm.getRawValue().currentPassword)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.sessionsForm.reset();
          this.message.set('Se cerraron las otras sesiones.');
          this.load();
        },
        error: (error) => {
          this.sessionsForm.reset();
          this.error.set(securityError(error));
        },
      });
  }
}
