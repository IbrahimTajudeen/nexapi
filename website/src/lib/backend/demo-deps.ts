import type { ApiDeps, Principal } from "../../server/api";
import type { Backend, StaffRole } from "./types";

const ROLES: readonly string[] = ["admin", "editor", "contributor"];

/** What the API needs, backed by the in-browser demo store. There is no real security here. */
export function createDemoDeps(store: Backend): ApiDeps {
  return {
    mode: "demo",
    store: () => store,
    authenticate(token): Promise<Principal | null> {
      const m = /^demo:([a-z]+):(.+)$/.exec(token ?? "");
      if (!m || !ROLES.includes(m[1] ?? "")) return Promise.resolve(null);
      return Promise.resolve({ userId: "demo", email: m[2] ?? "", role: m[1] as StaffRole });
    },
  };
}
