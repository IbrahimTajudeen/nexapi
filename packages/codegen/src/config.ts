export interface NexApiConfig {
  /** Local OpenAPI file (JSON or YAML), relative to the config file. Remote URLs go through `--input`. */
  input?: string;
  /** Output directory, relative to the config file. */
  output?: string;
  /**
   * Place an operation at an explicit position in the resource tree. Entries are literal
   * property names or `{param}` references that must list the operation's path parameters in
   * order. Use it to rename resources or to resolve ambiguous routes.
   *
   * @example { "listUsers": { "path": ["users", "list"] } }  →  api.users.list.get(...)
   */
  overrides?: { operations?: Record<string, { path: string[] }> };
  /** operationIds to leave out (e.g. multipart operations until they are supported). */
  exclude?: string[];
  naming?: {
    /** Prefix for path-parameter segments. Default `by` (`/users/{id}` → `users.byId(id)`). */
    paramPrefix?: string;
  };
}

export interface ResolvedConfig {
  overrides: Record<string, { path: string[] }>;
  exclude: ReadonlySet<string>;
  paramPrefix: string;
}

export function validateConfig(raw: unknown): { config: NexApiConfig; problems: string[] } {
  const problems: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { config: {}, problems: ["config must be a JSON object"] };
  const c = raw as Record<string, unknown>;
  const known = new Set(["$schema", "input", "output", "overrides", "exclude", "naming"]);
  for (const key of Object.keys(c))
    if (!known.has(key)) problems.push(`unknown config key "${key}"`);
  if (c["input"] !== undefined && typeof c["input"] !== "string")
    problems.push('"input" must be a string');
  if (c["output"] !== undefined && typeof c["output"] !== "string")
    problems.push('"output" must be a string');
  if (
    c["exclude"] !== undefined &&
    !(Array.isArray(c["exclude"]) && c["exclude"].every((x) => typeof x === "string"))
  )
    problems.push('"exclude" must be an array of strings');
  const overrides = c["overrides"];
  if (overrides !== undefined) {
    if (typeof overrides !== "object" || overrides === null)
      problems.push('"overrides" must be an object');
    else if ((overrides as Record<string, unknown>)["operations"] !== undefined) {
      const ops = (overrides as Record<string, unknown>)["operations"];
      if (typeof ops !== "object" || ops === null)
        problems.push('"overrides.operations" must be an object');
      else
        for (const [id, v] of Object.entries(ops as Record<string, unknown>)) {
          const path = (v as { path?: unknown } | null)?.path;
          if (
            !Array.isArray(path) ||
            path.length === 0 ||
            !path.every((s) => typeof s === "string")
          )
            problems.push(`overrides.operations.${id}.path must be a non-empty array of strings`);
        }
    }
  }
  const naming = c["naming"] as { paramPrefix?: unknown } | undefined;
  if (
    naming !== undefined &&
    naming.paramPrefix !== undefined &&
    typeof naming.paramPrefix !== "string"
  )
    problems.push('"naming.paramPrefix" must be a string');
  return { config: c, problems };
}

export function resolveConfig(config: NexApiConfig): ResolvedConfig {
  return {
    overrides: config.overrides?.operations ?? {},
    exclude: new Set(config.exclude ?? []),
    paramPrefix: config.naming?.paramPrefix ?? "by",
  };
}
