import type { HouseholdMember } from '@/lib/types';

/**
 * Short attribution label: "you" for the viewer, the member's name for a
 * current co-member, or a neutral fallback for a member who has since
 * deleted their account (`addedBy` is null — the expense stays in the shared
 * pool, only the attribution is anonymized; see migration
 * 0007_expense_attribution.sql). Callers supply already-translated labels,
 * same pattern as `dayLabel` in `date.ts` — this module stays
 * framework-agnostic, no next-intl import.
 */
export function attributionLabel(
  addedBy: string | null,
  currentUserId: string,
  member: HouseholdMember | undefined,
  labels: { you: string; partner: string; formerMember: string }
): string {
  if (addedBy === null) return labels.formerMember;
  if (addedBy === currentUserId) return labels.you;
  return member?.displayName?.trim() || labels.partner;
}
