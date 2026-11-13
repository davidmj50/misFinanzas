import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ImportDecision, ImportResult, ImportRow } from '../models/import.models';

@Injectable({ providedIn: 'root' })
export class ImportsService {
  private readonly baseUrl = `${environment.apiUrl}/imports`;
  constructor(private readonly http: HttpClient) {}

  preview(accountId: string, rows: ImportRow[]) {
    return this.http.post<{ currency: string; rows: ImportDecision[] }>(`${this.baseUrl}/preview`, { accountId, rows });
  }

  commit(accountId: string, fileName: string, requestId: string, rows: ImportRow[]) {
    return this.http.post<ImportResult>(`${this.baseUrl}/commit`, { accountId, fileName, requestId, rows });
  }
}
