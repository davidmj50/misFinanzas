import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Category, CreateCategoryPayload } from '../models/finance.models';

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly baseUrl = `${environment.apiUrl}/categories`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<Category[]>(this.baseUrl);
  }

  get(id: string) {
    return this.http.get<Category>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateCategoryPayload) {
    return this.http.post<Category>(this.baseUrl, payload);
  }

  update(id: string, payload: Partial<CreateCategoryPayload>) {
    return this.http.patch<Category>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
