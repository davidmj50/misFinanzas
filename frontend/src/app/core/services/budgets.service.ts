import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Budget, CreateBudgetPayload, UpdateBudgetPayload } from '../models/budget.models';

@Injectable({ providedIn: 'root' })
export class BudgetsService {
  private readonly baseUrl = `${environment.apiUrl}/budgets`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<Budget[]>(this.baseUrl);
  }

  create(payload: CreateBudgetPayload) {
    return this.http.post<Budget>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateBudgetPayload) {
    return this.http.patch<Budget>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
