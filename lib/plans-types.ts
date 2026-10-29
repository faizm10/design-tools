/** Row shape returned by GET /api/plans. */
export interface PlanSummary {
  id: string;
  name: string;
  updatedAt: string;
  width: number;
  length: number;
  items: number;
  /** False for plans someone else shared with you. */
  owned: boolean;
  ownerName: string;
  /** People the plan is shared with, not counting the owner. */
  members: number;
}
