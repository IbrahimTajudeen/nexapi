import { Code } from "./Code";
import { Tabs } from "./Tabs";

const MANAGERS: { id: string; label: string; add: (pkgs: string) => string }[] = [
  { id: "npm", label: "npm", add: (p) => `npm install ${p}` },
  { id: "pnpm", label: "pnpm", add: (p) => `pnpm add ${p}` },
  { id: "yarn", label: "yarn", add: (p) => `yarn add ${p}` },
  { id: "bun", label: "bun", add: (p) => `bun add ${p}` },
];

export function PackageInstall({ packages, dev = false }: { packages: string; dev?: boolean }) {
  return (
    <Tabs
      group="pm"
      tabs={MANAGERS.map((m) => {
        let cmd = m.add(packages);
        if (dev) cmd = cmd.replace(/ (install|add) /, (s) => `${s}-D `);
        return {
          id: m.id,
          label: m.label,
          content: (
            <Code lang="bash" title="terminal">
              {cmd}
            </Code>
          ),
        };
      })}
    />
  );
}
