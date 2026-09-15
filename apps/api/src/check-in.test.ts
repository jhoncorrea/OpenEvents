import { describe, expect, it } from "vitest";
import { registerCheckIn } from "./check-in.js";

describe("registerCheckIn", () => {
  it("rejects an unknown code", () => {
    expect(registerCheckIn("UNKNOWN").status).toBe("invalid");
  });

  it("accepts a valid code only once", () => {
    const code = "OE-2027-001";
    expect(registerCheckIn(code).status).toBe("accepted");
    expect(registerCheckIn(code).status).toBe("duplicate");
  });
});
