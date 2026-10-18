# @nexapi/react

React hooks over `@nexapi/core`: `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, and an optional `NexProvider`. The data lives only in the core cache; hooks are `useSyncExternalStore` subscriptions, safe under Strict Mode and server rendering (create one client per request).

```tsx
const user = useQuery(api.users.byId(id).get.options());
const rename = useMutation(api.users.byId(id).patch.options());
```

Peer dependency: React 18 or 19. Pre-1.0.
