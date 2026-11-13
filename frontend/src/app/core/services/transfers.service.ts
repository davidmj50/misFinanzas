import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PaginatedResult } from '../models/finance.models';
import { CreateTransferPayload, Transfer } from '../models/transfer.models';

@Injectable({ providedIn: 'root' })
export class TransfersService {
  private readonly baseUrl = `${environment.apiUrl}/transfers`;
  constructor(private readonly http: HttpClient) {}

  list(page = 1, accountId = '') {
    let params = new HttpParams().set('page', page).set('pageSize', 25);
    if (accountId) params = params.set('accountId', accountId);
    return this.http.get<PaginatedResult<Transfer>>(this.baseUrl, { params });
  }

  create(payload: CreateTransferPayload) {
    return this.http.post<Transfer>(this.baseUrl, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
