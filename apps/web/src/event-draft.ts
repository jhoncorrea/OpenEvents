import type { EventFormValues } from "./event-form";

export interface EventDraft {
  values: EventFormValues;
  outcomeUncertain: boolean;
}

interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "openevents:event-draft:v1:";

const fieldLimits = {
  name: 200,
  slug: 120,
  startsAt: 32,
  endsAt: 32,
  timezone: 100,
  location: 500,
} satisfies Record<keyof EventFormValues, number>;

function storageKey(accountKey: string): string {
  return `${PREFIX}${encodeURIComponent(accountKey)}`;
}

function browserStorage(): DraftStorage {
  return window.sessionStorage;
}

function parseDraft(value: unknown): EventDraft | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    record.version !== 1 ||
    typeof record.outcomeUncertain !== "boolean" ||
    typeof record.values !== "object" ||
    record.values === null
  ) {
    return null;
  }

  const values = record.values as Record<string, unknown>;

  for (const field of Object.keys(fieldLimits) as Array<
    keyof EventFormValues
  >) {
    if (
      typeof values[field] !== "string" ||
      values[field].length > fieldLimits[field]
    ) {
      return null;
    }
  }

  // Extraer únicamente los campos conocidos.
  return {
    values: {
      name: values.name as string,
      slug: values.slug as string,
      startsAt: values.startsAt as string,
      endsAt: values.endsAt as string,
      timezone: values.timezone as string,
      location: values.location as string,
    },
    outcomeUncertain: record.outcomeUncertain,
  };
}

export function readEventDraft(
  accountKey: string,
  storage?: DraftStorage,
): EventDraft | null {
  if (!accountKey) {
    return null;
  }

  try {
    const raw = (storage ?? browserStorage()).getItem(
      storageKey(accountKey),
    );

    if (!raw || raw.length > 12000) {
      return null;
    }

    return parseDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveEventDraft(
  accountKey: string,
  draft: EventDraft,
  storage?: DraftStorage,
): boolean {
  if (!accountKey) {
    return false;
  }

  try {
    const parsed = parseDraft({ version: 1, ...draft });

    if (!parsed) {
      return false;
    }

    (storage ?? browserStorage()).setItem(
      storageKey(accountKey),
      JSON.stringify({ version: 1, ...parsed }),
    );

    return true;
  } catch {
    return false;
  }
}

export function clearEventDraft(
  accountKey: string,
  storage?: DraftStorage,
): boolean {
  if (!accountKey) {
    return false;
  }

  try {
    (storage ?? browserStorage()).removeItem(storageKey(accountKey));
    return true;
  } catch {
    return false;
  }
}