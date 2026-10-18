# @nyxapi/devtools

Cache diagnostics for NyxAPI.

```ts
import { createInspector } from "@nyxapi/devtools";

const inspector = createInspector(nyx.queryClient, {
  redact: (key, data) => data, // decide what `inspectData` may reveal
});
inspector.subscribe(() => console.log(inspector.snapshot().queries));
```

- `snapshot()` is referentially stable until something changes, so it works with `useSyncExternalStore`.
  It lists query state, observer counts, errors (name and message) and a bounded event log. It never
  contains cached data.
- `inspectData(hash)` returns one entry's data through `redact`.
- `refetch`, `invalidate`, `remove` act on one entry. `dispose()` stops listening.

React panel (requires `@nyxapi/react`):

```tsx
import { NyxDevtools } from "@nyxapi/devtools/react";

<NyxDevtools defaultOpen />; // client from <NyxProvider>, or pass `client`
```

It renders nothing when `process.env.NODE_ENV === "production"` unless `force` is set. Not yet
available: a per-request timeline.
