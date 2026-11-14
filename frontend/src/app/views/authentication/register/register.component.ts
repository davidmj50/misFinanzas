import { newPasswordValidator } from '../../../core/utils/password-policy';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertComponent } from '@coreui/angular';
import { AuthBrandComponent } from '../auth-brand.component';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  host: {
    class: 'auth-page',
  },
  imports: [AlertComponent, AuthBrandComponent, ReactiveFormsModule, RouterLink],
})
export class RegisterComponent {
  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, newPasswordValidator]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.authService.register(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/account-security']),
      error: (err) => {
        this.errorMessage.set(err.error?.message ?? 'No se pudo crear la cuenta.');
        this.loading.set(false);
      },
    });
  }
}
