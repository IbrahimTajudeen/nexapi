import { createNyxClient } from "@nyxapi/core";
import { useMutation, useQuery } from "@nyxapi/react";
import { createApi } from "../generated/index.js";

// One NyxClient per user/request: it owns the HTTP credentials *and* the cache.
export const nyx = createNyxClient({
  baseUrl: "https://api.example.com/v1",
  getToken: () => localStorage.getItem("token"),
});
export const api = createApi(nyx);

export function UserCard({ userId }: { userId: string }) {
  const user = useQuery(api.users.byId(userId).get.options(undefined, { staleTime: 30_000 }));
  const rename = useMutation(
    api.users.byId(userId).patch.options(undefined, {
      // optimistic: visible immediately, rolled back (only this update) if the request fails
      onMutate: (patch, { optimistic }) => {
        optimistic(api.users.byId(userId).get.key(), (old: { name: string } | undefined) =>
          old ? { ...old, ...patch } : undefined,
        );
      },
      invalidates: [api.users.byId(userId).get.key()],
    }),
  );

  if (user.isPending) return <p>Loading…</p>;
  if (user.isError && !user.data) return <p>Failed: {user.error?.message}</p>;
  return (
    <button disabled={rename.isPending} onClick={() => rename.mutate({ name: "Ada Lovelace" })}>
      {user.data?.name}
    </button>
  );
}
