# @nexapi/devtools

Cache diagnostics for NexAPI.

```ts
import { createInspector } from "@nexapi/devtools";

const inspector = createInspector(nex.queryClient, {
  redact: (key, data) => data, // decide what `inspectData` may reveal
});
inspector.subscribe(() => console.log(inspector.snapshot().queries));
```

- `snapshot()` is referentially stable until something changes, so it works with `useSyncExternalStore`.
  It lists query state, observer counts, errors (name and message) and a bounded event log. It never
  contains cached data.
- `inspectData(hash)` returns one entry's data through `redact`.
- `refetch`, `invalidate`, `remove` act on one entry. `dispose()` stops listening.

React panel (requires `@nexapi/react`):

```tsx
import { NexDevtools } from "@nexapi/devtools/react";

<NexDevtools defaultOpen />; // client from <NexProvider>, or pass `client`
```

It renders nothing when `process.env.NODE_ENV === "production"` unless `force` is set. Not yet
available: a per-request timeline.
