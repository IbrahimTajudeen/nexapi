import { describe, expect, it } from "vitest";
import { createEngine } from "../src/lib/engine";
import { LABS, composeLab, type Lab } from "../src/lib/labs";
import { formatValue, runSnippet } from "../src/lib/run";

async function run(code: string, latency = 20): Promise<string> {
  const engine = createEngine();
  engine.server.latency = latency;
  const lines: string[] = [];
  await runSnippet(engine, code, (...v) => lines.push(v.map(formatValue).join(" ")));
  return lines.join("\n");
}

describe("option labs run against the real engine", () => {
  for (const lab of Object.values(LABS) as Lab[]) {
    describe(lab.title, () => {
      it.concurrent("the default program prints what the docs say", async () => {
        const text = await run(composeLab(lab));
        let from = 0;
        for (const part of lab.expectDefault) {
          const at = text.indexOf(part, from);
          expect(at, `"${part}" not found in:\n${text}`).toBeGreaterThanOrEqual(0);
          from = at + part.length;
        }
      });

      for (const option of lab.options) {
        option.choices.forEach((choice, index) => {
          it.concurrent(`${option.name}: ${choice.label} runs`, async () => {
            const code = composeLab(lab, { [option.name]: index });
            expect(code).not.toContain("{{");
            // A choice may fail inside the program on purpose; it must never be a syntax or
            // reference error, which would reject here.
            const text = await run(code);
            expect(text.length).toBeGreaterThan(0);
          });
        });
      }
    });
  }

  it("every option has a default-first choice list and a summary", () => {
    for (const lab of Object.values(LABS) as Lab[]) {
      for (const option of lab.options) {
        expect(option.choices.length, `${lab.id}.${option.name}`).toBeGreaterThanOrEqual(1);
        expect(option.summary.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("option labs show the documented effect", () => {
  const q = LABS.query;
  it("staleTime keeps the cache fresh for the second observer", async () => {
    const def = await run(composeLab(q));
    const fresh = await run(composeLab(q, { staleTime: 1 }));
    expect(def).toContain("requests after a second observer mounted: 2");
    expect(fresh).toContain("requests after a second observer mounted: 1");
  });
  it("enabled:false never fetches", async () => {
    const text = await run(composeLab(q, { enabled: 1 }));
    expect(text).toContain("status: pending");
    expect(text).toContain("requests after the first observer: 0");
  });
  it("select reports only the name", async () => {
    const text = await run(composeLab(q, { select: 1 }));
    expect(text).toContain("data: Ada Lovelace");
  });
  it("placeholderData is reported as a placeholder", async () => {
    const text = await run(composeLab(q, { placeholderData: 1 }));
    expect(text).toContain("status: success");
  });
  it("mutation: empty name fails and rolls back", async () => {
    const m = LABS.mutation;
    const text = await run(composeLab(m, { variables: 1, onMutate: 1, onError: 1 }), 200);
    expect(text).toContain('while in flight, cached name: ""');
    expect(text).toContain("outcome: failed (422)");
    expect(text).toContain("final cached name: Ada Lovelace");
    expect(text).toContain("onError: 422 Name cannot be empty");
  });
  it("client: absolute urls are refused by default and allowed on request", async () => {
    const c = LABS.client;
    const refused = await run(composeLab(c, { path: 1 }));
    expect(refused).toContain("failed:");
    const allowed = await run(composeLab(c, { path: 1, allowAbsoluteUrls: 1 }));
    expect(allowed).toContain("sent: GET https://evil.example/steal");
  });
  it("client: a token becomes a bearer header", async () => {
    const text = await run(composeLab(LABS.client, { getToken: 1 }));
    expect(text).toContain("Bearer demo-token");
  });
  it("request: csv style joins values", async () => {
    const text = await run(composeLab(LABS.request, { queryStyles: 1 }));
    expect(text).toContain("role=admin,member");
  });
  it("infinite: maxPages bounds memory", async () => {
    const text = await run(composeLab(LABS.infinite, { maxPages: 1 }));
    expect(text).toContain("pages held: 2");
  });
});
