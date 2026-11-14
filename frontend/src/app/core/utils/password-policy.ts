import { ValidatorFn } from '@angular/forms';
export const newPasswordValidator: ValidatorFn = (control) => {
  const value: string = control.value ?? '';
  if (!value) return null;
  return Array.from(value).length >= 15 &&
    new TextEncoder().encode(value).length <= 72 &&
    !value.includes('\0')
    ? null
    : { passwordPolicy: true };
};
export const matchingPasswords: ValidatorFn = (control) =>
  control.get('newPassword')?.value === control.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };
