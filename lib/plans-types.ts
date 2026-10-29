/** Row shape returned by GET /api/plans. */
export interface PlanSummary {
  id: string;
  name: string;
  updatedAt: string;
  width: number;
  length: number;
  items: number;
}
