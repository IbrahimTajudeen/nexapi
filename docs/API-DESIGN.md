# API design and compatibility

Status: **0.0.x, pre-release.** Anything here may change; every change must update this file and the compile-time tests.

## Resource tree (generated)

| OpenAPI              | Generated                                                                  |
| -------------------- | -------------------------------------------------------------------------- |
| `POST /auth/login`   | `api.auth.login.post(body)`                                                |
| `GET /users/{id}`    | `api.users.byId(id).get()`                                                 |
| `PATCH /users/{id}`  | `api.users.byId(id).patch(body)`                                           |
| `DELETE /users/{id}` | `api.users.byId(id).delete()` → `Promise<void>` for 204                    |
| `GET /users`         | `api.users.get({ query })` (or `api.users.list.get(...)` with an override) |

Rules: literal segments → camelCase; `{param}` → `by` + PascalCase(param) and the function takes exactly that parameter; one path parameter per function so chains read left to right. Methods are properties (`get head post put patch delete`). Missing `operationId`s are synthesized (`GET /users/{id}/posts` → `getUsersByIdPosts`). Collisions (two segments → one key, a segment named like a method, equivalent templates such as `/a/{x}` vs `/a/{y}`, colliding generated type names) are **errors**, never silent overwrites; resolve with `overrides.operations.<operationId>.path`.

## Argument grammar

```
query endpoint     get(request?)                       options(request?, config?)   key(request?)   prefetch(request?, config?)   invalidate(request?)
mutation endpoint  post(body, request?)  | del(request?)   options(request?, config?)   key()
```

- `request = { query?, headers?, signal? }` (`signal` only on direct calls). It becomes **required** iff some part is required.
- The **body is the first argument** of a mutation (matches `api.auth.login.post(loginBody)`); operations without a body take only `request`.
- `config` (staleTime, select, retry, …) is always the **second** argument of `options`, so it can never be confused with request input, at the cost of `options(undefined, { staleTime })` for endpoints without request parameters. Chosen over `options(config)` because the position never depends on the endpoint.
- `options(request)` for a mutation binds query/headers; the body is supplied later as the mutation _variables_ (`mutate(body)`).
- `key()` without a request returns the route **prefix** (`[METHOD, template, params]`), which is also the exact key of a request-less call. Use it for filters (`invalidateQueries(api.users.list.get.key())`).
- Path parameters are never part of `request`; they are bound while navigating.

Types: `QueryEndpoint<TReq, TData, TErrBody>`, `MutationEndpoint<TReq, TBody, TData, TErrBody>`. Errors surface as `EndpointError<TErrBody>` = `HttpError<TErrBody> | NetworkError | TimeoutError | ParseError | RequestError`.

### Placeholder data

`placeholderData` (a value, or a function of the previously observed query's raw data; `keepPreviousData` is the identity helper) is shown only while an entry has no data. It is a view concern: never written to the cache, never dehydrated, reported via `isPlaceholder: true` with `status: "success"` and `dataUpdatedAt: 0`. A function that returns a fresh object each call yields a new result per notification, so return stable values.

### Infinite queries: both directions and `maxPages`

`getPreviousPageParam` enables `fetchPreviousPage`/`hasPreviousPage`/`isFetchingPreviousPage`; without it the previous-page API is inert (`hasPreviousPage: false`, no request). `maxPages` (integer ≥ 1, otherwise `RangeError`) drops the page at the opposite end when one is loaded, so memory stays bounded. A refetch re-requests only the pages held, starting from the first one held (not `initialPageParam`), and reads the confirmed data so optimistic patches cannot change which pages are requested. Directional loads never race: while one is in flight, a second call in either direction joins it and issues no request of its own, so call again after it settles.

### Optional response validation

With `"validation": true` in `syncapi.config.json`, codegen also emits `shapes.ts` (plain data, no code, no dependency) and attaches the shape of every JSON success response to its endpoint. The runtime then checks each response and rejects with `ResponseValidationError` (`issues: { path, expected, received }[]`, at most 10) when it differs; turn it off per client with `createNexClient({ validateResponses: false })`. Reports contain positions and types, never values, because responses may carry personal data. A mismatch is deterministic, so it is never retried, and it lands in query state like any error.

What is checked: types, required properties, literals/enums, arrays, unions (one member must match), intersections, declared `additionalProperties` types. What is not: undeclared extra properties are accepted (servers add fields without breaking clients), and `integer`, `format`, length, pattern and range constraints are not represented, so they are not enforced. Validation runs once per fetch on the parsed body (cost is linear in its size; benchmark before enabling on very large payloads). Turning the option off later leaves `shapes.ts` on disk, unreferenced; delete it.

### Suspense: `useSuspenseQuery`

`data` is never `undefined`: the component suspends until the entry has data, and a failed first load is thrown to the nearest error boundary. Suspending reads the cache entry (not component state, which React discards when a component suspends on mount), so sibling components share one request, and `renderToPipeableStream` waits for the data inside the request's own client. `renderToString` cannot wait and emits the fallback. Stale data renders at once and refetches in the background; a failed background refetch keeps the data and does not throw. `staleTime` is raised to at least 1000 ms so the freshly resolved data is not immediately refetched on mount. `enabled` and `placeholderData` are not accepted.

Retry after an error boundary resets: the same error is rethrown on every render (React retries a render once before showing the boundary), so call `invalidate()` on the endpoint in the reset handler; the next render fetches again. To support this, a first load that fails now clears `isInvalidated` (the flag is meaningless without data). Edge: no `useSuspenseInfiniteQuery` yet.

### Non-JSON bodies and responses

Request bodies: JSON is preferred when declared; otherwise `multipart/form-data`, `application/x-www-form-urlencoded`, `text/plain`, then binary (`application/octet-stream` or a `format: binary` string). The generated endpoint carries `bodyKind`, and the runtime encodes accordingly: multipart accepts a plain object of scalars, `Blob`s and arrays of them (or a ready `FormData`) and never sets `content-type` itself, so `fetch` supplies the boundary. Form bodies with nested objects or free-form schemas are rejected at generation time (`UNSUPPORTED_BODY_SCHEMA`) and at runtime. Per-part `encoding` (part content types) is ignored. Success responses: JSON, `text/*` (`string`) or any other content (`Blob`), carried as `response: "json" | "text" | "blob" | "none"`; one operation cannot mix payload kinds across its 2xx responses. Error responses are still parsed as JSON (or kept as text). Blobs are read fully into memory (no streaming) and `Blob`/`FormData` bodies are not part of the cache key.

### Query parameter styles

Default is exploded (`a=1&a=2`). Codegen also honours `style: form, explode: false` (comma-separated), `spaceDelimited`/`pipeDelimited` arrays of scalars, and `deepObject` objects of scalars (`filter[a]=1`), emitting a per-operation `queryStyles` map that the runtime applies. Delimited styles reject a value containing its own delimiter, and `deepObject` rejects nested objects/arrays and keys containing brackets, rather than send an ambiguous query. Other array styles produce an `UNSUPPORTED_STYLE` warning (sent exploded); unsupported object parameters remain errors. Spaces in `spaceDelimited` values are encoded as `+` (form encoding), not `%20`.

### Offline: `paused`

With the default `networkMode: "online"`, a fetch that starts (or retries) while the environment reports offline does not call `queryFn`; the entry reports `fetchStatus: "paused"` (`isPaused`, not `isFetching`/`isLoading`) and resumes on the reconnect event, still as one deduplicated run. `cancel()` and supersede work while paused. `networkMode: "always"` opts out. Only a browser (`window` plus `navigator.onLine === false`) can report offline, because other runtimes (Node, which has a `navigator` without `onLine`) give no reconnect signal to resume from. Mutations are deliberately not paused: they fail fast with `NetworkError`, since silently queueing a write for later is an unsafe-retry hazard.

### Typed errors

Documented error responses are emitted per operation as `XErrorBody = ErrorCase<404, ApiError> | ErrorCase<422, ...>`. `EndpointError<XErrorBody>` distributes this into `HttpError<ApiError, 404> | HttpError<..., 422> | NetworkError | ...`, so after `error instanceof HttpError`, checking `error.status` narrows `error.body`. Range (`5XX`) and `default` responses are typed with `status: number`, so they do not narrow literal statuses; operations that document no errors get `unknown`. Narrowing relies on `instanceof`/`status`, not on `error.name` (a plain `string`). The server can still return an undocumented status at runtime; bodies are not validated (see below).

Trade-offs recorded: (1) error typing reflects the schema, not runtime guarantees; (2) navigation allocates a few small closures per `byId(...)` call; (3) response bodies are **trusted by default**; opt-in validation is described next (error bodies and request bodies are never validated).

## Cache keys

`[METHOD, "/users/{id}", { id: "42" }, { query?, headers? }?]`. Keys may contain strings, finite numbers, booleans, `null`, `Date`, arrays and plain objects; anything else throws (no silent collisions). Object key order and `undefined` properties never matter. Filters match **array prefixes with deep-partial objects**.

## Mutation retries

Off by default. Enabling requires `{ idempotent: true, attempts }` (compile-time and runtime check), then only transient errors retry unless `when` says otherwise.

## Security defaults

No logging anywhere. Errors never include headers, bodies or query strings. Base origin is pinned; `allowAbsoluteUrls` is an explicit opt-in. Auth tokens are only attached to requests to the configured origin. Create one `NexClient` per user/request on servers.

## Breaking-change policy (from 0.1)

Public = everything exported from package entry points plus the _shape_ of generated code. Generated-code shape changes require a major version of `@syncapi/codegen` and a note in the changelog; `syncapi generate --check` in CI makes drift visible.
