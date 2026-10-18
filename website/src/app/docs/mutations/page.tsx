import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3, Table } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Mutations and optimistic updates" };

export default function Page() {
  return (
    <Doc
      href="/docs/mutations/"
      title="Mutations and optimistic updates"
      lede="A mutation changes something on the server. NexAPI runs each one once, keeps the cache honest, and lets you show the result before the server answers."
    >
      <Callout kind="write" title="Writes">
        Writes follow stricter rules than reads, because running one twice can mean two orders or
        two emails.
      </Callout>

      <H2>Run a mutation</H2>
      <p>The simplest form is a direct call. The body is the first argument:</p>
      <Runnable id="login" />
      <p>
        To get lifecycle callbacks, cache updates and ordering, use <code>options()</code> with the
        query client:
      </p>
      <Code lang="ts">{`const rename = api.users.byId("1").patch.options(undefined, {
  invalidates: [api.users.byId("1").get.key()],
});

const updated = await nex.queryClient.mutate(rename, { name: "Ada Lovelace" });`}</Code>
      <p>
        <code>invalidates</code> lists the cached reads that are now out of date. After the mutation
        succeeds they are marked stale, and the ones being watched refetch. The mutation resolves
        after that refetch finishes.
      </p>

      <H2>Optimistic updates</H2>
      <p>
        An optimistic update shows the expected result immediately, then confirms it or undoes it
        when the server answers. In NexAPI an update is a small function applied on top of the
        cached data, called a patch.
      </p>
      <Runnable id="optimistic" rows={18} />
      <H3>If the request fails</H3>
      <p>
        When the mutation fails, NexAPI removes exactly the patch you added. Other patches, and any
        newer data from the server, stay. Compare with the approach of saving a snapshot and
        restoring it: a snapshot taken before a slow request can erase newer changes made while it
        was running.
      </p>
      <Runnable id="rollback" rows={18} />

      <H2>Lifecycle callbacks</H2>
      <Table
        head={["Callback", "Runs", "Receives"]}
        rows={[
          [
            <code key="a">onMutate</code>,
            "Immediately, before the request",
            <>
              variables and <code>{"{ client, optimistic }"}</code>. Whatever it returns becomes{" "}
              <code>context</code>.
            </>,
          ],
          [
            <code key="b">onSuccess</code>,
            "After a successful response",
            "data, variables, context, helpers",
          ],
          [<code key="c">onError</code>, "After a failure", "error, variables, context, helpers"],
          [
            <code key="d">onSettled</code>,
            "After either",
            "data or undefined, error or null, variables, context, helpers",
          ],
        ]}
      />
      <p>
        The transaction returned by <code>optimistic()</code> is managed for you: rolled back on
        failure, committed on success. You can also call <code>rollback()</code> or{" "}
        <code>commit()</code> yourself.
      </p>

      <H2>Keeping writes in order</H2>
      <p>
        Mutations that share a <code>scope</code> run their network calls one after another, in the
        order you submitted them, while their optimistic parts still apply immediately. Use it for
        edits to the same record:
      </p>
      <Code lang="ts">{`api.users.byId("1").patch.options(undefined, { scope: { id: "user:1" } });`}</Code>

      <H2>Retrying a write</H2>
      <p>
        Retries are off for mutations. To turn them on you must state that the operation is safe to
        repeat, for example because your server deduplicates on an idempotency key. Without{" "}
        <code>idempotent: true</code>, the option is a type error and is rejected at runtime.
      </p>
      <Code lang="ts">{`api.payments.post.options(undefined, {
  retry: { idempotent: true, attempts: 2, delay: 500 },
});`}</Code>
      <p>
        Only transient failures (network, timeout, 408, 429, 5xx) retry unless you pass{" "}
        <code>when</code>.
      </p>

      <H2>Related</H2>
      <ul>
        <li>
          <Link href="/docs/errors/">Errors</Link>: narrowing what a failed mutation tells you.
        </li>
        <li>
          <Link href="/docs/react/">React</Link>: <code>useMutation</code> wraps all of this.
        </li>
      </ul>
    </Doc>
  );
}
