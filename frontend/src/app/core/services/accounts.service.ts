import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Account, AccountBalancePoint, CreateAccountPayload } from '../models/finance.models';

@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly baseUrl = `${environment.apiUrl}/accounts`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<Account[]>(this.baseUrl);
  }

  get(id: string) {
    return this.http.get<Account>(`${this.baseUrl}/${id}`);
  }

  create(payload: CreateAccountPayload) {
    return this.http.post<Account>(this.baseUrl, payload);
  }

  update(id: string, payload: Partial<CreateAccountPayload & { archived: boolean }>) {
    return this.http.patch<Account>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getBalanceHistory(id: string) {
    return this.http.get<AccountBalancePoint[]>(`${this.baseUrl}/${id}/balance-history`);
  }
}
