import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { QuickEntryInput } from './quick-draft.store';
@Injectable({ providedIn: 'root' })
export class QuickEntriesService {
  private readonly http = inject(HttpClient);
  create(input: QuickEntryInput) { return this.http.post<{ transactionId: string; createdAt: string }>(`${environment.apiUrl}/quick-entries`, input); }
}
