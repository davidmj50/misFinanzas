import { FormControl, FormGroup } from '@angular/forms';
import { matchingPasswords, newPasswordValidator } from './password-policy';
describe('Contraseñas nuevas', () => {
  it('cuenta caracteres Unicode y evita truncar contraseñas en el servidor', () => {
    const input = new FormControl('', newPasswordValidator);
    for (const invalid of [
      '12345678',
      'a'.repeat(73),
      '🔑'.repeat(19),
      'contraseña con\0nulo',
    ]) {
      input.setValue(invalid);
      expect(input.invalid).toBe(true);
    }
    for (const valid of [
      'una frase segura 2026',
      '🔑'.repeat(15),
      'a'.repeat(72),
    ]) {
      input.setValue(valid);
      expect(input.valid).toBe(true);
    }
  });
  it('admite campo vacío en edición y comprueba la confirmación', () => {
    expect(new FormControl('', newPasswordValidator).valid).toBe(true);
    const form = new FormGroup(
      {
        newPassword: new FormControl('frase'),
        confirmPassword: new FormControl('otra'),
      },
      { validators: matchingPasswords },
    );
    expect(form.hasError('passwordMismatch')).toBe(true);
    form.controls.confirmPassword.setValue('frase');
    expect(form.valid).toBe(true);
  });
});
