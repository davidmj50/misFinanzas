import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const api = environment.apiUrl.replace(/\/$/, '');
  const isApi = req.url === api || req.url.startsWith(api + '/');
  const path = req.url.split('?')[0].slice(api.length);
  const publicAuth = isApi && ['/auth/login', '/auth/register', '/auth/password/forgot', '/auth/password/reset', '/auth/email/verify'].includes(path);
  // Financial data and writes always go to the API, outside the service worker.
  let authReq = isApi ? req.clone({ setHeaders: { 'ngsw-bypass': 'true' } }) : req;
  if (token && isApi && !publicAuth) authReq = authReq.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(authReq).pipe(
    catchError((error) => {
      if (isApi && !publicAuth && error.status === 401 && authService.isAuthenticated() && token === authService.getToken()) {
        authService.logout(false, router.url);
      }
      return throwError(() => error);
    }),
  );
};
