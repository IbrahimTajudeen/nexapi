import Link from "next/link";
import { REPO_URL, VERSION } from "@/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <strong style={{ color: "var(--ink)" }}>NyxAPI</strong>
          <p style={{ marginTop: 8, maxWidth: "24em" }}>
            An open source, schema-generated API client with a built-in query and mutation engine.
            MIT licensed. Version {VERSION}, early development.
          </p>
        </div>
        <div>
          <h4>Learn</h4>
          <Link href="/docs/">Documentation</Link>
          <Link href="/docs/quick-start/">Quick start</Link>
          <Link href="/beginners/">Beginners</Link>
          <Link href="/playground/">Playground</Link>
        </div>
        <div>
          <h4>Get it</h4>
          <Link href="/install/">Install</Link>
          <Link href="/install/#downloads">Downloads</Link>
          <Link href="/releases/">Releases</Link>
          <Link href="/docs/cli/">CLI</Link>
          <Link href="/docs/benchmarks/">Benchmarks</Link>
        </div>
        <div>
          <h4>Project</h4>
          <Link href="/contribute/">Contribute</Link>
          <Link href="/community/">Community</Link>
          <Link href="/guides/">Guides</Link>
          {REPO_URL && (
            <a href={REPO_URL} rel="noopener">
              Source code
            </a>
          )}
          <Link href="/docs/security/">Security</Link>
        </div>
      </div>
    </footer>
  );
}
