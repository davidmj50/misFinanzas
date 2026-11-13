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
  // Financial data and writes always go to the API, outside the service worker.
  let authReq = isApi ? req.clone({ setHeaders: { 'ngsw-bypass': 'true' } }) : req;
  if (token && isApi) authReq = authReq.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(authReq).pipe(
    catchError((error) => {
      if (isApi && error.status === 401 && authService.isAuthenticated()) {
        authService.logout(false, router.url);
      }
      return throwError(() => error);
    }),
  );
};
