import type { Metadata } from "next";
import { PlaygroundTabs } from "@/components/PlaygroundTabs";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Run NexAPI code, try a React demo, or generate a typed client from your own OpenAPI schema, all in your browser.",
};

export default function Page() {
  return (
    <div className="wrap pg-layout">
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)", marginBottom: 10 }}>Playground</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem", maxWidth: "42em" }}>
        Everything here is the real library running in your browser. Nothing is sent to a server.
        Write code, try a React app with live devtools, or turn your own OpenAPI file into a typed
        client.
      </p>
      <PlaygroundTabs />
    </div>
  );
}
