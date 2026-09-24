export interface SavingsContribution {
  id: string;
  goalId: string;
  amount: string;
  date: string;
  note?: string | null;
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: string;
  targetDate?: string | null;
  color?: string | null;
  archived: boolean;
  contributions: SavingsContribution[];
  saved: number;
  remaining: number;
  percentage: number;
  daysRemaining: number | null;
  suggestedMonthly: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavingsGoalPayload {
  name: string;
  targetAmount: number;
  targetDate?: string;
  color?: string;
}

export interface UpdateSavingsGoalPayload {
  name?: string;
  targetAmount?: number;
  targetDate?: string;
  archived?: boolean;
}

export interface CreateContributionPayload {
  amount: number;
  date: string;
  note?: string;
}
