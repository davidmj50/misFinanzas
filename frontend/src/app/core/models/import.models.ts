import { TransactionType } from './finance.models';

export interface ImportRow {
  rowId: number;
  date: string;
  type: TransactionType;
  amount: number;
  description?: string;
  merchant?: string;
  notes?: string;
  categoryId?: string | null;
  currency?: string;
  externalRef?: string;
  allowDuplicate?: boolean;
}
export type ImportStatus = 'NEW' | 'DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'INVALID';
export interface ImportDecision {
  rowId: number;
  status: ImportStatus;
  reason: string;
  canForce: boolean;
  categoryId?: string | null;
  matchedRule?: { id: string; name: string } | null;
}
export interface ImportResult {
  batchId: string;
  imported: number;
  skipped: number;
  total: number;
  createdAt: string;
}
