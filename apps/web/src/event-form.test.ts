import { describe, expect, it } from "vitest";
import {
  validateEventForm,
  type EventFormValues,
} from "./event-form";

const validValues: EventFormValues = {
  name: "DevOpsDays Lima 2027",
  slug: "devopsdays-lima-2027",
  startsAt: "2027-08-27T09:00",
  endsAt: "2027-08-27T17:00",
  timezone: "America/Lima",
  location: "Centro de Convenciones de Lima",
};

function expectFieldError(
  values: EventFormValues,
  field: keyof EventFormValues,
) {
  const result = validateEventForm(values);

  expect(result.success).toBe(false);

  if (result.success) {
    throw new Error("Expected validation failure.");
  }

  expect(result.errors[field]).toEqual(expect.any(String));
}

describe("validateEventForm", () => {
  it("converts Lima local dates to UTC", () => {
    expect(validateEventForm(validValues)).toEqual({
      success: true,
      data: {
        ...validValues,
        startsAt: "2027-08-27T14:00:00.000Z",
        endsAt: "2027-08-27T22:00:00.000Z",
      },
    });
  });

  it("uses the selected timezone", () => {
    const result = validateEventForm({
      ...validValues,
      timezone: "Asia/Tokyo",
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        startsAt: "2027-08-27T00:00:00.000Z",
        endsAt: "2027-08-27T08:00:00.000Z",
      },
    });
  });

  it("trims text fields", () => {
    const result = validateEventForm({
      ...validValues,
      name: ` ${validValues.name} `,
      slug: ` ${validValues.slug} `,
      timezone: " America/Lima ",
      location: ` ${validValues.location} `,
    });

    expect(result).toEqual(validateEventForm(validValues));
  });

  it("accepts the maximum text lengths", () => {
    expect(
      validateEventForm({
        ...validValues,
        name: "a".repeat(200),
        slug: "a".repeat(120),
        location: "a".repeat(500),
      }).success,
    ).toBe(true);
  });

  it.each([
    "name",
    "slug",
    "location",
    "timezone",
    "startsAt",
    "endsAt",
  ] as const)("rejects an empty %s", (field) => {
    expectFieldError({ ...validValues, [field]: "" }, field);
  });

  it.each([
    ["name", 201],
    ["slug", 121],
    ["location", 501],
    ["timezone", 101],
  ] as const)("rejects an oversized %s", (field, length) => {
    expectFieldError(
      { ...validValues, [field]: "a".repeat(length) },
      field,
    );
  });

  it.each([
    "Evento",
    "evento--lima",
    "-evento",
    "evento-",
    "evento lima",
    "evento_lima",
  ])("rejects invalid slug: %s", (slug) => {
    expectFieldError({ ...validValues, slug }, "slug");
  });

  it.each(["-05:00", "+09:00", "Not/AZone"])(
    "rejects invalid timezone: %s",
    (timezone) => {
      expectFieldError({ ...validValues, timezone }, "timezone");
    },
  );

  it.each([
    "2027-02-29T09:00",
    "2027-04-31T09:00",
    "2027-08-27T24:00",
    "2027-08-27T09:60",
    "2027-08-27",
    "2027-08-27T09:00Z",
    "2027-08-27T09:00-05:00",
    "0000-08-27T09:00",
  ])("rejects invalid local start: %s", (startsAt) => {
    expectFieldError({ ...validValues, startsAt }, "startsAt");
  });

  it("rejects an invalid end date", () => {
    expectFieldError(
      { ...validValues, endsAt: "2027-02-30T17:00" },
      "endsAt",
    );
  });

  it.each(["2027-08-27T09:00", "2027-08-27T08:00"])(
    "rejects an end that is not later: %s",
    (endsAt) => {
      expectFieldError({ ...validValues, endsAt }, "endsAt");
    },
  );

  it("accepts a leap day in a leap year", () => {
    expect(
      validateEventForm({
        ...validValues,
        startsAt: "2028-02-29T09:00",
        endsAt: "2028-02-29T17:00",
      }).success,
    ).toBe(true);
  });

  it("rejects a nonexistent time during the spring transition", () => {
    expectFieldError(
      {
        ...validValues,
        timezone: "America/New_York",
        startsAt: "2027-03-14T02:30",
        endsAt: "2027-03-14T04:00",
      },
      "startsAt",
    );
  });

  it("rejects an ambiguous time during the autumn transition", () => {
    expectFieldError(
      {
        ...validValues,
        timezone: "America/New_York",
        startsAt: "2027-11-07T01:30",
        endsAt: "2027-11-07T03:00",
      },
      "startsAt",
    );
  });

  it("converts valid dates across a daylight saving transition", () => {
    expect(
      validateEventForm({
        ...validValues,
        timezone: "America/New_York",
        startsAt: "2027-03-14T01:30",
        endsAt: "2027-03-14T03:30",
      }),
    ).toMatchObject({
      success: true,
      data: {
        startsAt: "2027-03-14T06:30:00.000Z",
        endsAt: "2027-03-14T07:30:00.000Z",
      },
    });
  });

  it("does not include extra properties in the API payload", () => {
    const result = validateEventForm({
      ...validValues,
      ...{ id: "caller-id", status: "active" },
    });

    expect(result).toEqual(validateEventForm(validValues));
  });
});