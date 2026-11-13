import type { CategorizationRule, TransactionType } from '@prisma/client';

// Literal matching only: normalize accents, case and whitespace, never execute regex input.
export const normalizeRuleText = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
export type MatchingRule = CategorizationRule & { category: { id: string; name: string; type: TransactionType } };
export function matchRule(rules: MatchingRule[], row: { type: TransactionType; merchant?: string | null; description?: string | null }, accountId: string) {
  return rules.find(rule => {
    if (!rule.active || rule.category.type !== row.type || (rule.accountId && rule.accountId !== accountId)) return false;
    const pattern = normalizeRuleText(rule.pattern);
    if (!pattern) return false;
    const texts = rule.field === 'MERCHANT' ? [row.merchant] : rule.field === 'DESCRIPTION' ? [row.description] : [row.merchant, row.description];
    return texts.some(text => {
      const value = normalizeRuleText(text ?? '');
      return rule.operator === 'EQUALS' ? value === pattern : rule.operator === 'STARTS_WITH' ? value.startsWith(pattern) : value.includes(pattern);
    });
  });
}
