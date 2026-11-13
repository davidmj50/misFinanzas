import { Account } from './finance.models';

export interface Transfer {
  cardStatementId?: string | null;
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAccount: Account;
  toAccount: Account;
  amount: string;
  destinationAmount: string;
  date: string;
  description?: string | null;
  requestId: string;
  createdAt: string;
}

export interface CreateTransferPayload {
  cardStatementId?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  destinationAmount?: number;
  date: string;
  description?: string;
  requestId: string;
}
