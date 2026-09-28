import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CreateTransferPayload, Transfer } from '../models/transfer.models';

@Injectable({ providedIn: 'root' })
export class TransfersService {
  private readonly baseUrl = `${environment.apiUrl}/transfers`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<Transfer[]>(this.baseUrl);
  }

  create(payload: CreateTransferPayload) {
    return this.http.post<Transfer>(this.baseUrl, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
