import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateTransactionPayload,
  PaginatedResult,
  Transaction,
  TransactionQuery,
  TransactionSummary,
} from '../models/finance.models';

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly baseUrl = `${environment.apiUrl}/transactions`;

  constructor(private readonly http: HttpClient) {}

  list(query: TransactionQuery = {}) {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return this.http.get<PaginatedResult<Transaction>>(this.baseUrl, { params });
  }

  summary(dateFrom?: string, dateTo?: string) {
    let params = new HttpParams();
    if (dateFrom) params = params.set('dateFrom', dateFrom);
    if (dateTo) params = params.set('dateTo', dateTo);
    return this.http.get<TransactionSummary>(`${this.baseUrl}/summary`, { params });
  }

  get(id: string) {
    return this.http.get<Transaction>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateTransactionPayload) {
    return this.http.post<Transaction>(this.baseUrl, payload);
  }

  update(id: string, payload: Partial<CreateTransactionPayload>) {
    return this.http.patch<Transaction>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
