import { EXAMPLES, type ExampleId } from "@/lib/examples";
import { Console } from "./Console";

/** An editable, runnable example from `lib/examples.ts` (each one is covered by a test). */
export function Runnable({ id, title, rows }: { id: ExampleId; title?: string; rows?: number }) {
  return (
    <div className="runnable">
      <Console code={EXAMPLES[id].code} title={title ?? `${id}.js`} rows={rows} />
    </div>
  );
}
