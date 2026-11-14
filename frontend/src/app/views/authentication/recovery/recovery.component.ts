import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthBrandComponent } from '../auth-brand.component';
import {
  AccountSecurityService,
  securityError,
} from '../../../core/services/account-security.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  matchingPasswords,
  newPasswordValidator,
} from '../../../core/utils/password-policy';

@Component({
  selector: 'app-recovery',
  host: { class: 'auth-page' },
  imports: [ReactiveFormsModule, RouterLink, AuthBrandComponent],
  templateUrl: './recovery.component.html',
})
export class RecoveryComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AccountSecurityService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly mode = this.route.snapshot.data['mode'] as string;
  readonly title =
    this.mode === 'forgot-password'
      ? 'Recupera tu acceso'
      : this.mode === 'reset-password'
        ? 'Elige una nueva contraseña'
        : 'Verifica tu correo';
  private token = this.route.snapshot.queryParamMap.get('token') ?? '';
  readonly validToken = /^[A-Za-z0-9_-]{43}$/.test(this.token);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly passwordForm = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, newPasswordValidator]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );
  constructor() {
    // Keep the one-use credential only in this component's memory.
    if (this.route.snapshot.queryParamMap.has('token'))
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });
  }
  submit() {
    if (this.busy() || this.done()) return;
    const form =
      this.mode === 'forgot-password' ? this.emailForm : this.passwordForm;
    if (this.mode !== 'verify-email' && form.invalid) {
      form.markAllAsTouched();
      return;
    }
    if (this.mode !== 'forgot-password' && !this.validToken) return;
    this.busy.set(true);
    this.error.set('');
    const request =
      this.mode === 'forgot-password'
        ? this.api.forgot(this.emailForm.getRawValue().email.trim())
        : this.mode === 'reset-password'
          ? this.api.reset(
              this.token,
              this.passwordForm.getRawValue().newPassword,
            )
          : this.api.verify(this.token);
    request.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: (response) => {
        this.token = '';
        this.passwordForm.reset();
        this.message.set(response.message);
        this.done.set(true);
        if (this.mode === 'reset-password' && this.auth.isAuthenticated())
          this.auth.logout(false);
        if (this.mode === 'verify-email' && this.auth.isAuthenticated())
          this.auth.refreshUser().subscribe({ error: () => undefined });
      },
      error: (error) => this.error.set(securityError(error)),
    });
  }
}
