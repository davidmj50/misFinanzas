import { Account, Category } from './finance.models';

export interface RecurringPayment {
  id: string;
  name: string;
  accountId: string;
  categoryId?: string | null;
  amount: string;
  dueDay: number;
  active: boolean;
  account: Account;
  category?: Category | null;
  nextDueDate: string;
  daysUntilDue: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringPaymentPayload {
  name: string;
  accountId: string;
  categoryId?: string;
  amount: number;
  dueDay: number;
  active?: boolean;
}

export type UpdateRecurringPaymentPayload = Partial<CreateRecurringPaymentPayload>;
