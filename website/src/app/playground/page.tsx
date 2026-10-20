import type { Metadata } from "next";
import { Ide } from "@/ide/Ide";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "A full code editor and terminal in your browser for NyxAPI and React. Create files, run commands, generate clients. Everything is saved on your device.",
};

export default function Page() {
  return (
    <div className="ide-page">
      <h1 className="sr-only">NyxAPI playground</h1>
      <Ide />
    </div>
  );
}
