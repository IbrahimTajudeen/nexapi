import { EXAMPLES, type ExampleId } from "@/lib/examples";
import { GUIDE_EXAMPLES, type GuideExampleId } from "@/lib/guide-examples";
import { Console } from "./Console";

/** An editable, runnable example from `lib/examples.ts` or `lib/guide-examples.ts` (each is covered by a test). */
export function Runnable({
  id,
  title,
  rows,
}: {
  id: ExampleId | GuideExampleId;
  title?: string;
  rows?: number;
}) {
  const example = id in EXAMPLES ? EXAMPLES[id as ExampleId] : GUIDE_EXAMPLES[id as GuideExampleId];
  return (
    <div className="runnable">
      <Console code={example.code} title={title ?? `${id}.js`} rows={rows} />
    </div>
  );
}
