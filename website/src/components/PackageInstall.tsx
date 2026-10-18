import { Code } from "./Code";
import { Tabs } from "./Tabs";

const MANAGERS: {
  id: string;
  label: string;
  add: (pkgs: string) => string;
  global: (pkgs: string) => string;
}[] = [
  { id: "npm", label: "npm", add: (p) => `npm install ${p}`, global: (p) => `npm install -g ${p}` },
  { id: "pnpm", label: "pnpm", add: (p) => `pnpm add ${p}`, global: (p) => `pnpm add -g ${p}` },
  { id: "yarn", label: "yarn", add: (p) => `yarn add ${p}`, global: (p) => `yarn global add ${p}` },
  { id: "bun", label: "bun", add: (p) => `bun add ${p}`, global: (p) => `bun add -g ${p}` },
];

export function PackageInstall({
  packages,
  dev = false,
  global = false,
}: {
  packages: string;
  dev?: boolean;
  /** Install as a global command instead of a project dependency. */
  global?: boolean;
}) {
  return (
    <Tabs
      group="pm"
      tabs={MANAGERS.map((m) => {
        let cmd = global ? m.global(packages) : m.add(packages);
        if (dev && !global) cmd = cmd.replace(/ (install|add) /, (s) => `${s}-D `);
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
