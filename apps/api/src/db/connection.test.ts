import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabaseConnection } from "./connection.js";

const mocks = vi.hoisted(() => ({
  query: vi.fn<(sql: string) => Promise<unknown>>(),
  end: vi.fn<() => Promise<void>>(),
  on: vi.fn<
    (event: string, listener: (error: Error) => void) => void
  >(),
}));

vi.mock("pg", () => ({
  Pool: class {
    query = mocks.query;
    end = mocks.end;
    on = mocks.on;
  },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({}),
}));

function setupConnection() {
  const onIdleError = vi.fn();

  const connection = createDatabaseConnection({
    databaseUrl: "postgresql://localhost/openevents_test",
    onIdleError,
  });

  return { connection, onIdleError };
}

describe("database connection lifecycle", () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue(undefined);
    mocks.end.mockReset().mockResolvedValue(undefined);
    mocks.on.mockReset();
  });

  it("does not execute a query when creating the connection module", () => {
    setupConnection();

    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.end).not.toHaveBeenCalled();
  });

  it("checks connectivity successfully", async () => {
    const { connection } = setupConnection();

    await expect(connection.checkConnection()).resolves.toBeUndefined();

    expect(mocks.query).toHaveBeenCalledExactlyOnceWith("SELECT 1");
    expect(mocks.end).not.toHaveBeenCalled();
  });

  it("propagates connectivity failures to the caller", async () => {
    const failure = new Error("Connection unavailable");
    mocks.query.mockRejectedValue(failure);
    const { connection } = setupConnection();

    await expect(connection.checkConnection()).rejects.toBe(failure);
  });

  it("reports idle connection failures without forwarding sensitive details", () => {
    const { onIdleError } = setupConnection();
    const errorRegistration = mocks.on.mock.calls.find(
      ([event]) => event === "error",
    );

    expect(errorRegistration).toBeDefined();

    if (!errorRegistration) {
      throw new Error("The pool error listener was not registered.");
    }

    const listener = errorRegistration[1];
    listener(new Error("Sensitive connection details"));

    expect(onIdleError).toHaveBeenCalledTimes(1);
    expect(onIdleError).toHaveBeenCalledWith();
  });

  it("shares one pending shutdown across repeated close calls", async () => {
    let finishClosing: () => void = () => {};

    const pendingClose = new Promise<void>((resolve) => {
      finishClosing = resolve;
    });

    mocks.end.mockReturnValue(pendingClose);
    const { connection } = setupConnection();

    const firstClose = connection.close();
    const secondClose = connection.close();

    expect(firstClose).toBe(secondClose);
    expect(mocks.end).toHaveBeenCalledTimes(1);

    finishClosing();
    await Promise.all([firstClose, secondClose]);

    await connection.close();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("propagates a shutdown failure without attempting another pool shutdown", async () => {
    const failure = new Error("Shutdown failed");
    mocks.end.mockRejectedValue(failure);
    const { connection } = setupConnection();

    await expect(connection.close()).rejects.toBe(failure);
    await expect(connection.close()).rejects.toBe(failure);

    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});