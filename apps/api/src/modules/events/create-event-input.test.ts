import { describe, expect, it } from "vitest";
import { parseCreateEventInput } from "./create-event-input.js";

const validInput = {
  name: "DevOpsDays Lima 2027",
  slug: "devopsdays-lima-2027",
  startsAt: "2027-08-27T14:00:00Z",
  endsAt: "2027-08-27T22:00:00Z",
  timezone: "America/Lima",
  location: "Centro de Convenciones de Lima",
};

describe("parseCreateEventInput", () => {
  it("accepts valid input and converts dates", () => {
    const result = parseCreateEventInput(validInput);

    expect(result).toEqual({
      ...validInput,
      startsAt: new Date(validInput.startsAt),
      endsAt: new Date(validInput.endsAt),
    });
  });

  it("trims surrounding whitespace from text fields", () => {
    const result = parseCreateEventInput({
      ...validInput,
      name: "  DevOpsDays Lima 2027  ",
      slug: "  devopsdays-lima-2027  ",
      timezone: "  America/Lima  ",
      location: "  Centro de Convenciones de Lima  ",
    });

    expect(result.name).toBe(validInput.name);
    expect(result.slug).toBe(validInput.slug);
    expect(result.timezone).toBe(validInput.timezone);
    expect(result.location).toBe(validInput.location);
  });

  it.each(["name", "slug", "timezone", "location"])(
    "rejects an empty %s",
    (field) => {
      expect(() =>
        parseCreateEventInput({
          ...validInput,
          [field]: "   ",
        }),
      ).toThrow();
    },
  );

  it.each([
    "DevOpsDays-Lima",
    "devopsdays lima",
    "devopsdays--lima",
    "-devopsdays",
    "devopsdays-",
    "event/2027",
  ])("rejects the invalid slug %s", (slug) => {
    expect(() =>
      parseCreateEventInput({ ...validInput, slug }),
    ).toThrow();
  });

  it.each([
    "not-a-date",
    "2027-02-30T14:00:00Z",
    "2027-08-27T14:00:00",
    "2027-08-27T09:00:00-05:00",
  ])("rejects an invalid or non-UTC date: %s", (value) => {
    for (const field of ["startsAt", "endsAt"]) {
      expect(() =>
        parseCreateEventInput({
          ...validInput,
          [field]: value,
        }),
      ).toThrow();
    }
  });

  it.each([
    "2027-08-27T13:00:00Z",
    "2027-08-27T14:00:00Z",
  ])("rejects an end at or before the start: %s", (endsAt) => {
    expect(() =>
      parseCreateEventInput({ ...validInput, endsAt }),
    ).toThrow();
  });

  it.each(["Mars/Olympus", "-05:00"])(
    "rejects an invalid timezone name: %s",
    (timezone) => {
      expect(() =>
        parseCreateEventInput({ ...validInput, timezone }),
      ).toThrow();
    },
  );

  it.each([
    ["name", 200],
    ["slug", 120],
    ["location", 500],
  ] as const)("enforces the length limit for %s", (field, limit) => {
    expect(() =>
      parseCreateEventInput({
        ...validInput,
        [field]: "a".repeat(limit),
      }),
    ).not.toThrow();

    expect(() =>
      parseCreateEventInput({
        ...validInput,
        [field]: "a".repeat(limit + 1),
      }),
    ).toThrow();
  });

  it.each(["id", "status"])(
    "rejects the caller-controlled field %s",
    (field) => {
      expect(() =>
        parseCreateEventInput({
          ...validInput,
          [field]: field === "status" ? "active" : "custom-id",
        }),
      ).toThrow();
    },
  );

  it.each([
    "name",
    "slug",
    "startsAt",
    "endsAt",
    "timezone",
    "location",
  ])("rejects a missing required field: %s", (field) => {
    const input: Record<string, unknown> = { ...validInput };
    delete input[field];

    expect(() => parseCreateEventInput(input)).toThrow();
  });

  it.each([null, undefined, "event", 123, []])(
    "rejects input that is not an event object: %j",
    (input) => {
      expect(() => parseCreateEventInput(input)).toThrow();
    },
  );
});