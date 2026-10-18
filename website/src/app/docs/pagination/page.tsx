import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2 } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Pagination" };

export default function Page() {
  return (
    <Doc
      href="/docs/pagination/"
      title="Pagination"
      lede="Infinite queries load a list one page at a time, forward or backward, and keep every page in a single cache entry."
    >
      <Callout kind="read">
        Pagination is a read. All the query rules about freshness and retries apply.
      </Callout>

      <H2>Load pages</H2>
      <p>
        You describe where the first page starts and how to find the next one. Here the server
        returns 4 users and we ask for 2 per page:
      </p>
      <Runnable id="pagination" rows={22} />
      <p>
        <code>getNextPageParam</code> returns the parameter for the next page, or{" "}
        <code>undefined</code> when there are no more. The result holds <code>data.pages</code> and{" "}
        <code>data.pageParams</code>.
      </p>

      <H2>Both directions</H2>
      <p>
        Add <code>getPreviousPageParam</code> to load pages before the first one. It enables{" "}
        <code>fetchPreviousPage</code>, <code>hasPreviousPage</code> and{" "}
        <code>isFetchingPreviousPage</code>; without it those are inactive.
      </p>

      <H2>Limit memory</H2>
      <p>
        <code>maxPages</code> keeps at most that many pages. When another is loaded, the page at the
        opposite end is dropped. It must be an integer of at least 1.
      </p>

      <H2>Refetching</H2>
      <p>
        A refetch requests only the pages you currently hold, starting from the first one held, so
        it does not jump back to page 1. It reads confirmed data, so optimistic changes cannot alter
        which pages are requested.
      </p>

      <H2>No races</H2>
      <p>
        While one page request is in flight, another call in either direction joins it and sends
        nothing of its own. Call again after it settles to load the next page.
      </p>

      <H2>In React</H2>
      <Code lang="tsx">{`const pages = useInfiniteQuery({
  queryKey: ["users", "paged"],
  initialPageParam: 1,
  queryFn: ({ pageParam, signal }) =>
    api.users.list.get({ query: { page: pageParam, limit: 20 }, signal }),
  getNextPageParam: (last, all) => (all.length * 20 < last.total ? all.length + 1 : undefined),
  queryClient: nex.queryClient,
});

pages.data?.pages.flatMap((p) => p.items);
pages.hasNextPage && <button onClick={() => pages.fetchNextPage()}>More</button>;`}</Code>
    </Doc>
  );
}
