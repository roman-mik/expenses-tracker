import type { HouseholdMember } from '@/lib/types';

/** Short attribution label: "you" for the viewer, else the member's name. */
export function attributionLabel(
  addedBy: string,
  currentUserId: string,
  member: HouseholdMember | undefined
): string {
  if (addedBy === currentUserId) return 'you';
  return member?.displayName?.trim() || 'partner';
}
