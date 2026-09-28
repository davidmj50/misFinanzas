import { AccountType } from './finance.models';

export interface TransferAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  description?: string | null;
  fromAccount: TransferAccount;
  toAccount: TransferAccount;
  createdAt: string;
}

export interface CreateTransferPayload {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description?: string;
}
