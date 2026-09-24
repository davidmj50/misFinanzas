export type AccountType = 'BANK' | 'CREDIT_CARD' | 'CASH';
export type TransactionType = 'INCOME' | 'EXPENSE';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution?: string | null;
  currency: string;
  initialBalance: string;
  balance?: number;
  color?: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountBalancePoint {
  month: string;
  balance: number;
}

export type CreateAccountPayload = Pick<Account, 'name' | 'type'> &
  Partial<Pick<Account, 'institution' | 'currency' | 'color'>> & { initialBalance?: number };

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon?: string | null;
  color?: string | null;
  parentId?: string | null;
  subcategories?: Category[];
  createdAt: string;
}

export type CreateCategoryPayload = Pick<Category, 'name' | 'type'> &
  Partial<Pick<Category, 'icon' | 'color' | 'parentId'>>;

export interface Transaction {
  id: string;
  accountId: string;
  categoryId?: string | null;
  type: TransactionType;
  amount: string;
  currency: string;
  date: string;
  merchant?: string | null;
  description?: string | null;
  paymentMethod?: string | null;
  tags: string[];
  isRecurring: boolean;
  notes?: string | null;
  account?: Account;
  category?: Category | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionPayload {
  accountId: string;
  categoryId?: string | null;
  type: TransactionType;
  amount: number;
  currency?: string;
  date: string;
  merchant?: string;
  description?: string;
  paymentMethod?: string;
  tags?: string[];
  isRecurring?: boolean;
  notes?: string;
}

export interface TransactionQuery {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  type: TransactionType;
  total: number;
}

export interface MonthlyBreakdown {
  month: string;
  income: number;
  expense: number;
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpense: number;
  byCategory: CategoryBreakdown[];
  byMonth: MonthlyBreakdown[];
}
