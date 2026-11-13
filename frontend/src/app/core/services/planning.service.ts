import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Account } from '../models/finance.models';
export interface CardConfiguration { creditLimit: number; closingDay: number; paymentDay: number; paymentAccountId: string | null; }
export interface StatementInput { cardAccountId: string; closingDate: string; dueDate: string; plannedPaymentDate: string | null; total: number; minimumPayment: number; }
export interface CardStatement extends Omit<StatementInput, 'total' | 'minimumPayment'> {
  id: string; total: string; minimumPayment: string; paid: number; scheduled: number; remaining: number; unplanned: number;
  minimumRemaining: number; overdue: boolean; scheduledLate: boolean; isLatest: boolean;
  payments: { id: string; date: string; destinationAmount: string; fromAccount: { id: string; name: string } }[];
}
export interface CardControl extends Omit<Account, 'balance'> {
  asOf: string; balance: number; debt: number; availableCredit: number | null; utilization: number | null;
  nextClosingDate: string | null; nextPaymentDate: string | null;
  cardProfile: (Omit<CardConfiguration, 'creditLimit'> & { creditLimit: string; paymentAccount: Account | null }) | null;
  statements: CardStatement[];
}
export interface ProjectionEvent {
  id: string; kind: 'TRANSACTION' | 'RECURRING' | 'CARD_PAYMENT'; date: string; name: string; amount: number;
  recurringPaymentId?: string; dueDate?: string; statementId?: string;
}
export interface BalanceProjection {
  account: { id: string; name: string; type: Account['type']; currency: string }; asOf: string; through: string;
  paymentMode: 'FULL' | 'MINIMUM'; includeRecurring: boolean; openingBalance: number; closingBalance: number;
  minimumBalance: number; firstNegativeDate: string | null; firstOverLimitDate: string | null; totalInflows: number; totalOutflows: number;
  points: { date: string; balance: number }[]; events: ProjectionEvent[];
}
@Injectable({ providedIn: 'root' })
export class PlanningService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/planning`;
  cards() { return this.http.get<CardControl[]>(`${this.url}/cards`); }
  configure(id: string, input: CardConfiguration) { return this.http.put(`${this.url}/cards/${id}`, input); }
  saveStatement(input: StatementInput, id?: string) { return id ? this.http.put(`${this.url}/statements/${id}`, input) : this.http.post(`${this.url}/statements`, input); }
  removeStatement(id: string) { return this.http.delete<void>(`${this.url}/statements/${id}`); }
  pay(id: string, input: { fromAccountId: string; amount: number; date: string; requestId: string }) { return this.http.post(`${this.url}/statements/${id}/pay`, input); }
  recordRecurring(id: string, input: { dueDate: string; date: string; amount: number }) { return this.http.post(`${this.url}/recurring/${id}/record`, input); }
  projection(input: { accountId: string; days: number; paymentMode: 'FULL' | 'MINIMUM'; includeRecurring: boolean }) {
    const params = new HttpParams({ fromObject: input });
    return this.http.get<BalanceProjection>(`${this.url}/projection`, { params });
  }
}
