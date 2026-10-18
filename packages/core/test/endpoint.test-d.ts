/**
 * Compile-time contract tests for the public endpoint API. These are checked by
 * `pnpm typecheck`; a regression in a signature fails the build, no runtime needed.
 */
import { expectTypeOf } from "vitest";
import {
  createNexClient,
  type EndpointError,
  type MutationEndpoint,
  type NoRequest,
  type QueryEndpoint,
  type QueryOptions,
  type TypedKey,
} from "../src/index.js";

interface User {
  id: string;
  name: string;
}
interface ApiErr {
  code: string;
}
type Err = EndpointError<ApiErr>;

const client = createNexClient({ baseUrl: "https://api.test" });

// 1. endpoint with no input -----------------------------------------------------------------
const me = client.query<NoRequest, User, ApiErr>({ method: "get", path: "/me" });
expectTypeOf(me).toEqualTypeOf<QueryEndpoint<NoRequest, User, ApiErr>>();
expectTypeOf(me()).toEqualTypeOf<Promise<User>>();
expectTypeOf(me({ signal: new AbortController().signal })).toEqualTypeOf<Promise<User>>();
expectTypeOf(me.key()).toEqualTypeOf<TypedKey<User>>();
expectTypeOf(me.invalidate()).toEqualTypeOf<Promise<void>>();
expectTypeOf(me.prefetch()).toEqualTypeOf<Promise<void>>();
expectTypeOf(me.options()).toEqualTypeOf<QueryOptions<User, Err, User>>();
// the config is the *second* argument, so it can never be mistaken for request input
expectTypeOf(me.options(undefined, { staleTime: 1 })).toEqualTypeOf<
  QueryOptions<User, Err, User>
>();
// @ts-expect-error unknown config key
me.options(undefined, { staleTim: 1 });
// @ts-expect-error a no-input endpoint takes no query
me({ query: { page: 1 } });

// 2. optional query parameters --------------------------------------------------------------
type ListReq = { query?: { page?: number; limit?: number } };
const list = client.query<ListReq, User[], ApiErr>({ method: "get", path: "/users" });
expectTypeOf(list()).toEqualTypeOf<Promise<User[]>>();
expectTypeOf(list({ query: { page: 1, limit: 20 } })).toEqualTypeOf<Promise<User[]>>();
// @ts-expect-error wrong type
list({ query: { page: "1" } });
// @ts-expect-error unknown query param
list({ query: { nope: 1 } });
list.options({ query: { page: 2 } }, { staleTime: 5_000 });

// `select` changes the observed type
const names = list.options(undefined, { select: (users) => users.map((u) => u.name) });
expectTypeOf(names).toEqualTypeOf<QueryOptions<User[], Err, string[]>>();

// 3. required query parameter -> request becomes required ---------------------------------------
type SearchReq = { query: { q: string } };
const search = client.query<SearchReq, User[], ApiErr>({ method: "get", path: "/search" });
search({ query: { q: "x" } });
// @ts-expect-error request is required
search();
// @ts-expect-error request is required for options as well
search.options();
search.options({ query: { q: "x" } }, { retry: false });
// key()/invalidate() stay optional: omitting the request addresses every variant of the route
search.key();
search.invalidate();

// 4. path parameters are bound while navigating, so the endpoint itself never sees them ---------
const byId = (id: string) =>
  client.query<NoRequest, User, ApiErr>({ method: "get", path: "/users/{id}", params: { id } });
expectTypeOf(byId("42")()).toEqualTypeOf<Promise<User>>();

// 5. mutations: body first, request options second ----------------------------------------------
interface Login {
  email: string;
  password: string;
}
const login = client.mutation<NoRequest, Login, { token: string }, ApiErr>({
  method: "post",
  path: "/auth/login",
  hasBody: true,
});
expectTypeOf(login).toEqualTypeOf<MutationEndpoint<NoRequest, Login, { token: string }, ApiErr>>();
expectTypeOf(login({ email: "a", password: "b" })).toEqualTypeOf<Promise<{ token: string }>>();
// @ts-expect-error body is required
login();
// @ts-expect-error body shape is checked
login({ email: "a" });
const loginOptions = login.options();
expectTypeOf(loginOptions.mutationFn).parameter(0).toEqualTypeOf<Login>();

// mutation with a body and a required header
type TenantReq = { headers: { "x-tenant": string } };
const patch = client.mutation<TenantReq, Partial<User>, User, ApiErr>({
  method: "patch",
  path: "/u",
  hasBody: true,
});
patch({ name: "n" }, { headers: { "x-tenant": "t" } });
// @ts-expect-error required header missing
patch({ name: "n" });

// 6. no-content mutation: no body, resolves void --------------------------------------------------
const remove = client.mutation<NoRequest, void, void, ApiErr>({
  method: "delete",
  path: "/u",
  response: "none",
});
expectTypeOf(remove()).toEqualTypeOf<Promise<void>>();
expectTypeOf(remove.options().mutationFn).toEqualTypeOf<(variables: void) => Promise<void>>();

// 7. mutation retry must be an explicit idempotency declaration -----------------------------------
login.options(undefined, { retry: { idempotent: true, attempts: 2 } });
// @ts-expect-error retry without idempotent: true is rejected at compile time
login.options(undefined, { retry: { attempts: 2 } });
// @ts-expect-error a bare number is not a retry policy for mutations
login.options(undefined, { retry: 3 });

// 8. mutations have no query-only members ----------------------------------------------------------
// @ts-expect-error prefetch is query-only
void login.prefetch;
