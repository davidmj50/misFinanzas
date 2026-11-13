import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TransactionType } from '../models/finance.models';

export interface SaveRule {
  name: string;
  field: 'ANY' | 'DESCRIPTION' | 'MERCHANT';
  operator: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH';
  pattern: string;
  priority: number;
  active: boolean;
  categoryId: string;
  accountId: string | null;
}
export interface CategorizationRule extends SaveRule {
  id: string;
  category: { id: string; name: string; type: TransactionType };
  account: { id: string; name: string } | null;
}
export interface RuleTestResult {
  categoryId: string | null;
  categoryName: string | null;
  matchedRule: { id: string; name: string } | null;
}
@Injectable({ providedIn: 'root' })
export class CategorizationRulesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/categorization-rules`;
  list() { return this.http.get<CategorizationRule[]>(this.url); }
  save(rule: SaveRule, id?: string) { return id ? this.http.put(`${this.url}/${id}`, rule) : this.http.post(this.url, rule); }
  remove(id: string) { return this.http.delete<void>(`${this.url}/${id}`); }
  test(data: { accountId: string; type: TransactionType; description: string; merchant: string }) { return this.http.post<RuleTestResult>(`${this.url}/test`, data); }
}
