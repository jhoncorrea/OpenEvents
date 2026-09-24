import { z } from "zod";

const schema = z.strictObject({ expectedVersion: z.number().int().min(1).max(2_147_483_646) });
export function parseEventLifecycleInput(input: unknown): { expectedVersion: number } {
  return schema.parse(input);
}
