import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {

  constructor() {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = localStorage.getItem('auth_token'); // o sessionStorage, como prefieras

    const publicEndpoints = [
      '/auth/login',
      '/user/addUser'
    ];

    // Si es un endpoint público, dejamos pasar sin modificar
    const isPublic = publicEndpoints.some(url => req.url.includes(url));
    if (isPublic) {
      return next.handle(req);
    }

    // Si hay token, lo agregamos al header
    if (token) {
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      return next.handle(authReq);
    }

    return next.handle(req);
  }
}
