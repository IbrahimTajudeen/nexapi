"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => setState("done"),
          () => setState("failed"),
        );
        setTimeout(() => setState("idle"), 1600);
      }}
      aria-live="polite"
    >
      {state === "done" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}
