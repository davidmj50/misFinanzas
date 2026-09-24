import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CreateUserPayload, ManagedUser, UpdateUserPayload } from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly baseUrl = `${environment.apiUrl}/users`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<ManagedUser[]>(this.baseUrl);
  }

  get(id: string) {
    return this.http.get<ManagedUser>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateUserPayload) {
    return this.http.post<ManagedUser>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateUserPayload) {
    return this.http.patch<ManagedUser>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
