import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateContributionPayload,
  CreateSavingsGoalPayload,
  SavingsGoal,
  UpdateSavingsGoalPayload,
} from '../models/savings-goal.models';

@Injectable({ providedIn: 'root' })
export class SavingsGoalsService {
  private readonly baseUrl = `${environment.apiUrl}/savings-goals`;

  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<SavingsGoal[]>(this.baseUrl);
  }

  create(payload: CreateSavingsGoalPayload) {
    return this.http.post<SavingsGoal>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateSavingsGoalPayload) {
    return this.http.patch<SavingsGoal>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  addContribution(goalId: string, payload: CreateContributionPayload) {
    return this.http.post<SavingsGoal>(`${this.baseUrl}/${goalId}/contributions`, payload);
  }

  removeContribution(goalId: string, contributionId: string) {
    return this.http.delete<SavingsGoal>(`${this.baseUrl}/${goalId}/contributions/${contributionId}`);
  }
}
