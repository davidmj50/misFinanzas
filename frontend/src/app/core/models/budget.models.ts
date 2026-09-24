import { Category } from './finance.models';

export interface Budget {
  id: string;
  categoryId: string;
  amount: string;
  spent: number;
  remaining: number;
  percentage: number;
  category: Category;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetPayload {
  categoryId: string;
  amount: number;
}

export interface UpdateBudgetPayload {
  amount: number;
}
