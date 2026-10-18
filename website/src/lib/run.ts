import type { Engine } from "./engine";

const AsyncFunction = (
  Object.getPrototypeOf(async function () {
    /* constructor access */
  }) as { constructor: unknown }
).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

/** Render a value for the output panel. HTTP errors get their status appended. */
export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    const status = (value as { status?: number }).status;
    return `${value.name}: ${value.message}${status === undefined ? "" : ` (status ${String(status)})`}`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Run a snippet as the body of an async function. In scope: `api`, `nyx`, `core`, `server`,
 * `log`, `sleep`. Used by the playground and by the test that keeps every example honest.
 */
export async function runSnippet(
  engine: Engine,
  source: string,
  log: (...values: unknown[]) => void,
): Promise<unknown> {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const fn = new AsyncFunction("api", "nyx", "core", "log", "sleep", "server", source);
  return fn(engine.api, engine.nyx, engine.core, log, sleep, engine.server);
}
