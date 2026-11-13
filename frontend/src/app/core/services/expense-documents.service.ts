import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Transaction } from '../models/finance.models';
export interface ExpenseDocument { id: string; fileName: string; mimeType: string; size: number; sha256: string; createdAt: string; }
export interface ReceiptExpenseInput { requestId: string; accountId: string; categoryId: string | null; date: string; amount: number; merchant: string; description: string; notes: string; }
export interface DocumentUploadResult { transactionId: string; documentIds: string[]; createdAt: string; }
@Injectable({ providedIn: 'root' })
export class ExpenseDocumentsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/expense-documents`;
  expense(id: string) { return this.http.get<Transaction>(`${environment.apiUrl}/transactions/${id}`); }
  list(id: string) { return this.http.get<ExpenseDocument[]>(`${this.url}/expenses/${id}`); }
  upload(files: File[], metadata: ReceiptExpenseInput | { requestId: string }, transactionId?: string) {
    const form = new FormData(); form.append('metadata', JSON.stringify(metadata));
    for (const file of files) form.append('files', file, file.name);
    return this.http.post<DocumentUploadResult>(transactionId ? `${this.url}/expenses/${transactionId}` : `${this.url}/expenses`, form);
  }
  download(id: string) { return this.http.get(`${this.url}/${id}/file`, { responseType: 'blob' }); }
  remove(id: string) { return this.http.delete<void>(`${this.url}/${id}`); }
}
