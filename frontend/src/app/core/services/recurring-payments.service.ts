import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateRecurringPaymentPayload,
  RecurringPayment,
  UpdateRecurringPaymentPayload,
} from '../models/recurring-payment.models';

@Injectable({ providedIn: 'root' })
export class RecurringPaymentsService {
  private readonly baseUrl = `${environment.apiUrl}/recurring-payments`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<RecurringPayment[]>(this.baseUrl);
  }

  create(payload: CreateRecurringPaymentPayload) {
    return this.http.post<RecurringPayment>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateRecurringPaymentPayload) {
    return this.http.patch<RecurringPayment>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
