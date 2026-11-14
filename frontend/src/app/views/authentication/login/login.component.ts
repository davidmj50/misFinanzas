import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { safeReturnUrl } from '../../../core/utils/return-url';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertComponent } from '@coreui/angular';
import { AuthBrandComponent } from '../auth-brand.component';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  host: {
    class: 'auth-page',
  },
  imports: [AlertComponent, AuthBrandComponent, ReactiveFormsModule, RouterLink],
})
export class LoginComponent {
  private readonly route = inject(ActivatedRoute);
  readonly passwordChanged = this.route.snapshot.queryParamMap.get('passwordChanged') === '1';
  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
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

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'))),
      error: (err) => {
        this.errorMessage.set(err.error?.message ?? 'No se pudo iniciar sesión. Verifica tus datos.');
        this.loading.set(false);
      },
    });
  }
}
