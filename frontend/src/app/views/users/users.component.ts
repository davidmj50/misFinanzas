import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AlertComponent,
  BadgeComponent,
  ButtonCloseDirective,
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  ColComponent,
  FormControlDirective,
  FormDirective,
  FormLabelDirective,
  FormSelectDirective,
  FormTextDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
  ModalTitleDirective,
  RowComponent,
  TableDirective,
} from '@coreui/angular';
import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../../core/services/users.service';
import { ManagedUser } from '../../core/models/user.models';
import { UserRole } from '../../core/models/auth.models';

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  USER: 'Usuario',
};

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  imports: [
    AlertComponent,
    BadgeComponent,
    ButtonCloseDirective,
    ButtonDirective,
    CardBodyComponent,
    CardComponent,
    CardHeaderComponent,
    ColComponent,
    FormControlDirective,
    FormDirective,
    FormLabelDirective,
    FormSelectDirective,
    FormTextDirective,
    ModalBodyComponent,
    ModalComponent,
    ModalFooterComponent,
    ModalHeaderComponent,
    ModalTitleDirective,
    ReactiveFormsModule,
    RowComponent,
    TableDirective,
  ],
})
export class UsersComponent implements OnInit {
  readonly users = signal<ManagedUser[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly roleLabel = ROLE_LABEL;
  readonly roles: UserRole[] = ['USER', 'ADMIN'];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    role: ['USER' as UserRole, [Validators.required]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly usersService: UsersService,
    readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.usersService.list().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar los usuarios.');
        this.loading.set(false);
      },
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form.reset({ name: '', email: '', password: '', role: 'USER' });
    this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.controls.password.updateValueAndValidity();
    this.modalVisible.set(true);
  }

  openEdit(user: ManagedUser) {
    this.editingId.set(user.id);
    this.form.reset({ name: user.name, email: user.email, password: '', role: user.role });
    this.form.controls.password.setValidators([Validators.minLength(8)]);
    this.form.controls.password.updateValueAndValidity();
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const editingId = this.editingId();
    const request = editingId
      ? this.usersService.update(editingId, { ...raw, password: raw.password || undefined })
      : this.usersService.create({ ...raw, password: raw.password });

    request.subscribe({
      next: () => {
        this.modalVisible.set(false);
        this.load();
      },
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo guardar el usuario.'),
    });
  }

  remove(user: ManagedUser) {
    if (!confirm(`¿Eliminar al usuario "${user.name}"?`)) return;
    this.usersService.remove(user.id).subscribe({
      next: () => this.load(),
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo eliminar el usuario.'),
    });
  }
}
