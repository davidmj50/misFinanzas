export function safeReturnUrl(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/^\/authentication(?:\/|[?#]|$)/.test(value) ? value : '/dashboard';
}
