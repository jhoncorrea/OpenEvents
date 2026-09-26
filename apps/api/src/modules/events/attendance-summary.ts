import { z } from "zod";

export interface AttendanceSummary {
  eventId: string;
  registered: number;
  confirmed: number;
  cancelled: number;
  checkedIn: number;
  cancelledCheckedIn: number;
  pending: number;
  observedAt: Date;
}

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const schema = z.object({
  eventId: z.string().uuid(), registered: count, confirmed: count, cancelled: count,
  checkedIn: count, cancelledCheckedIn: count, pending: count, observedAt: z.date(),
}).refine(v => v.registered - v.confirmed === v.cancelled &&
  v.checkedIn <= v.registered && v.cancelledCheckedIn <= v.cancelled &&
  v.cancelledCheckedIn <= v.checkedIn && v.pending <= v.confirmed &&
  v.confirmed - v.pending === v.checkedIn - v.cancelledCheckedIn);

// Invalid operation output is a server failure, never an empty summary or a client error.
export function serializeAttendanceSummary(value: unknown, eventId: string) {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.eventId.toLowerCase() !== eventId) throw new Error("Invalid attendance summary");
  const v = parsed.data;
  return { eventId, registered: v.registered, confirmed: v.confirmed, cancelled: v.cancelled,
    checkedIn: v.checkedIn, cancelledCheckedIn: v.cancelledCheckedIn, pending: v.pending,
    observedAt: v.observedAt.toISOString() };
}
