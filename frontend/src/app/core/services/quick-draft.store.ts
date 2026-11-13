import { Injectable } from '@angular/core';
import { TransactionType } from '../models/finance.models';
export interface QuickFormValue { accountId: string; categoryId: string; type: TransactionType; amount: number | null; date: string; currency: string; merchant: string; description: string; }
export interface QuickEntryInput { requestId: string; accountId: string; categoryId: string | null; type: TransactionType; amount: number; date: string; currency: string; merchant: string; description: string; }
export interface QuickDraft { version: 1; ownerId: string; updatedAt: string; form: QuickFormValue; pending: QuickEntryInput | null; }
const prefix = 'misfinanzas_quick_draft_v1:';
const isForm = (value: unknown): value is QuickFormValue => {
  if (!value || typeof value !== 'object') return false;
  const form = value as QuickFormValue;
  return ['INCOME', 'EXPENSE'].includes(form.type) && ['accountId', 'categoryId', 'date', 'currency', 'merchant', 'description'].every(k => typeof (form as unknown as Record<string, unknown>)[k] === 'string') && (form.amount === null || (typeof form.amount === 'number' && Number.isFinite(form.amount)));
};
@Injectable({ providedIn: 'root' })
export class QuickDraftStore {
  key(ownerId: string) { return prefix + ownerId; }
  read(ownerId: string): QuickDraft | null {
    try {
      const raw = localStorage.getItem(this.key(ownerId)); if (!raw || raw.length > 12000) return null;
      const draft = JSON.parse(raw) as QuickDraft;
      if (draft.version !== 1 || draft.ownerId !== ownerId || !isForm(draft.form) || typeof draft.updatedAt !== 'string') return null;
      if (draft.pending) {
        const pending = draft.pending;
        if (!isForm({ ...pending, categoryId: pending.categoryId ?? '' }) || typeof pending.requestId !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(pending.requestId) || typeof pending.currency !== 'string' || !/^[A-Z]{3}$/.test(pending.currency) || typeof pending.amount !== 'number' || pending.amount <= 0) return null;
      }
      return draft;
    } catch { return null; }
  }
  save(ownerId: string, form: QuickFormValue, pending: QuickEntryInput | null): boolean {
    try { localStorage.setItem(this.key(ownerId), JSON.stringify({ version: 1, ownerId, form, pending, updatedAt: new Date().toISOString() } satisfies QuickDraft)); return true; } catch { return false; }
  }
  clear(ownerId: string) { try { localStorage.removeItem(this.key(ownerId)); return true; } catch { return false; } }
  clearAll() { this.keepOnly(null); }
  keepOnly(ownerId: string | null) {
    try { for (const key of Object.keys(localStorage)) if (key.startsWith(prefix) && key !== (ownerId ? this.key(ownerId) : null)) localStorage.removeItem(key); } catch { /* Storage may be disabled by the browser. */ }
  }
}
