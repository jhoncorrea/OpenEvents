import { describe, expect, it, vi } from "vitest";
import {
  clearEventDraft,
  readEventDraft,
  saveEventDraft,
  type EventDraft,
} from "./event-draft";

const draft: EventDraft = {
  values: {
    name: "Evento de prueba",
    slug: "evento-de-prueba",
    startsAt: "2027-08-27T09:00",
    endsAt: "2027-08-27T17:00",
    timezone: "America/Lima",
    location: "Lima",
  },
  outcomeUncertain: false,
};

function createStorage() {
  const entries = new Map<string, string>();

  return {
    entries,
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
  };
}

describe("event drafts", () => {
  it("saves and restores a draft", () => {
    const storage = createStorage();

    expect(saveEventDraft("account-a", draft, storage)).toBe(true);
    expect(readEventDraft("account-a", storage)).toEqual(draft);
  });

  it("keeps drafts separate for each account", () => {
    const storage = createStorage();

    saveEventDraft("account-a", draft, storage);

    expect(readEventDraft("account-b", storage)).toBeNull();
    expect(readEventDraft("account-a", storage)).toEqual(draft);
  });

  it("preserves an uncertain creation outcome", () => {
    const storage = createStorage();
    const uncertainDraft = { ...draft, outcomeUncertain: true };

    saveEventDraft("account-a", uncertainDraft, storage);

    expect(readEventDraft("account-a", storage)).toEqual(
      uncertainDraft,
    );
  });

  it("accepts an incomplete form", () => {
    const storage = createStorage();
    const incompleteDraft = {
      ...draft,
      values: { ...draft.values, name: "", endsAt: "" },
    };

    expect(
      saveEventDraft("account-a", incompleteDraft, storage),
    ).toBe(true);

    expect(readEventDraft("account-a", storage)).toEqual(
      incompleteDraft,
    );
  });

  it("stores only the known fields", () => {
    const storage = createStorage();

    saveEventDraft(
      "account-a",
      {
        ...draft,
        ...{ accessToken: "must-not-be-stored" },
        values: {
          ...draft.values,
          ...{ internalDetail: "must-not-be-stored" },
        },
      },
      storage,
    );

    expect(readEventDraft("account-a", storage)).toEqual(draft);
    expect([...storage.entries.values()][0]).not.toContain(
      "must-not-be-stored",
    );
  });

  it("clears only the requested account draft", () => {
    const storage = createStorage();

    saveEventDraft("account-a", draft, storage);
    saveEventDraft("account-b", draft, storage);

    expect(clearEventDraft("account-a", storage)).toBe(true);
    expect(readEventDraft("account-a", storage)).toBeNull();
    expect(readEventDraft("account-b", storage)).toEqual(draft);
  });

  it("returns null when no draft exists", () => {
    expect(readEventDraft("account-a", createStorage())).toBeNull();
  });

  it.each([
    "not-json",
    "null",
    "{}",
    JSON.stringify({ version: 2, ...draft }),
    JSON.stringify({ version: 1, ...draft, outcomeUncertain: "yes" }),
    JSON.stringify({
      version: 1,
      ...draft,
      values: { ...draft.values, name: 42 },
    }),
    JSON.stringify({
      version: 1,
      ...draft,
      values: { ...draft.values, location: "a".repeat(501) },
    }),
    "a".repeat(12001),
  ])("ignores a malformed stored draft: %s", (raw) => {
    const storage = createStorage();
    storage.getItem.mockReturnValue(raw);

    expect(readEventDraft("account-a", storage)).toBeNull();
  });

  it("rejects an oversized draft before writing", () => {
    const storage = createStorage();

    expect(
      saveEventDraft(
        "account-a",
        {
          ...draft,
          values: { ...draft.values, name: "a".repeat(201) },
        },
        storage,
      ),
    ).toBe(false);

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("handles unavailable storage without exposing its error", () => {
    const storage = createStorage();

    storage.getItem.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    storage.setItem.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    storage.removeItem.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(readEventDraft("account-a", storage)).toBeNull();
    expect(saveEventDraft("account-a", draft, storage)).toBe(false);
    expect(clearEventDraft("account-a", storage)).toBe(false);
  });

  it("does not access storage without an account key", () => {
    const storage = createStorage();

    expect(readEventDraft("", storage)).toBeNull();
    expect(saveEventDraft("", draft, storage)).toBe(false);
    expect(clearEventDraft("", storage)).toBe(false);

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});