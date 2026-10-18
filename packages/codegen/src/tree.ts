import type { ResolvedConfig } from "./config.js";
import type { Diagnostic, HttpMethod, OperationModel, ParameterModel } from "./ir.js";
import { isIdentifier, toCamel, toPascal } from "./naming.js";

export interface TreeNode {
  key: string;
  /** Where the key came from, to detect two different segments mapping to one key. */
  origin: string;
  param?: ParameterModel;
  methods: Map<HttpMethod, OperationModel>;
  children: Map<string, TreeNode>;
}

interface Segment {
  key: string;
  origin: string;
  param?: ParameterModel;
}

function newNode(key: string, origin: string, param?: ParameterModel): TreeNode {
  const node: TreeNode = { key, origin, methods: new Map(), children: new Map() };
  if (param) node.param = param;
  return node;
}

/**
 * Place every operation in the resource tree, reporting collisions instead of silently
 * overwriting: two segments with one key, a segment named like an HTTP method, two
 * operations at one spot, and equivalent templated paths (`/a/{x}` vs `/a/{y}`).
 */
export function buildTree(
  operations: readonly OperationModel[],
  cfg: ResolvedConfig,
  diagnostics: Diagnostic[],
): TreeNode {
  const error = (code: string, message: string): void =>
    void diagnostics.push({ level: "error", code, message });
  const root = newNode("", "root");
  const label = (op: OperationModel): string => `${op.method.toUpperCase()} ${op.path} (${op.id})`;

  const knownIds = new Set(operations.map((o) => o.id));
  for (const id of Object.keys(cfg.overrides))
    if (!knownIds.has(id) && !cfg.exclude.has(id))
      error("UNKNOWN_OVERRIDE", `overrides.operations references unknown operationId "${id}"`);

  // equivalent templates among operations that are not explicitly relocated
  const byShape = new Map<string, Set<string>>();
  for (const op of operations) {
    if (cfg.overrides[op.id]) continue;
    const shape = op.path.replace(/\{[^{}]+\}/g, "{}");
    (byShape.get(shape) ?? byShape.set(shape, new Set()).get(shape))?.add(op.path);
  }
  for (const [shape, paths] of byShape)
    if (paths.size > 1)
      error(
        "AMBIGUOUS_ROUTE",
        `Paths ${[...paths].map((p) => `"${p}"`).join(" and ")} are equivalent (${shape}). Relocate one with overrides.operations.<operationId>.path.`,
      );

  for (const op of operations) {
    const segments = segmentsFor(op, cfg, error);
    if (!segments) continue;
    let node = root;
    for (const seg of segments) {
      const existing = node.children.get(seg.key);
      if (existing) {
        if (existing.origin !== seg.origin)
          error(
            "NAME_COLLISION",
            `${label(op)}: segment "${seg.origin}" and "${existing.origin}" both generate the property "${seg.key}". Rename one with overrides.operations.<operationId>.path.`,
          );
        node = existing;
      } else {
        const child = newNode(seg.key, seg.origin, seg.param);
        node.children.set(seg.key, child);
        node = child;
      }
    }
    const clash = node.methods.get(op.method);
    if (clash)
      error(
        "NAME_COLLISION",
        `${label(op)} and ${label(clash)} are placed at the same position in the tree`,
      );
    else node.methods.set(op.method, op);
  }

  const check = (node: TreeNode, trail: string): void => {
    for (const method of node.methods.keys())
      if (node.children.has(method))
        error(
          "NAME_COLLISION",
          `At "${trail || "api"}": the child resource "${method}" collides with the ${method.toUpperCase()} method`,
        );
    for (const child of node.children.values()) check(child, `${trail}.${child.key}`);
  };
  check(root, "");
  return root;
}

function segmentsFor(
  op: OperationModel,
  cfg: ResolvedConfig,
  error: (code: string, message: string) => void,
): Segment[] | undefined {
  const param = (name: string): Segment | undefined => {
    const p = op.pathParams.find((x) => x.name === name);
    return p
      ? { key: `${cfg.paramPrefix}${toPascal(name)}`, origin: `{${name}}`, param: p }
      : undefined;
  };
  const override = cfg.overrides[op.id];
  if (override) {
    const out: Segment[] = [];
    const used: string[] = [];
    for (const raw of override.path) {
      const m = /^\{(.+)\}$/.exec(raw);
      if (m) {
        const seg = param(m[1] as string);
        if (!seg) {
          error(
            "INVALID_OVERRIDE",
            `overrides.operations.${op.id}.path: "${raw}" is not a path parameter of ${op.path}`,
          );
          return undefined;
        }
        used.push(m[1] as string);
        out.push(seg);
      } else {
        if (!isIdentifier(raw)) {
          error(
            "INVALID_OVERRIDE",
            `overrides.operations.${op.id}.path: "${raw}" is not a valid property name`,
          );
          return undefined;
        }
        out.push({ key: raw, origin: raw });
      }
    }
    if (used.join("\u0000") !== op.pathParams.map((p) => p.name).join("\u0000")) {
      error(
        "INVALID_OVERRIDE",
        `overrides.operations.${op.id}.path must reference the path parameters [${op.pathParams.map((p) => `{${p.name}}`).join(", ")}] in order`,
      );
      return undefined;
    }
    return out;
  }
  const out: Segment[] = [];
  let rawSegments = op.path.split("/").filter(Boolean);
  const prefix = cfg.stripPathPrefix;
  if (
    prefix.length > 0 &&
    rawSegments.length > prefix.length &&
    prefix.every((p, i) => rawSegments[i] === p)
  )
    rawSegments = rawSegments.slice(prefix.length);
  for (const raw of rawSegments) {
    const m = /^\{(.+)\}$/.exec(raw);
    if (m) {
      const seg = param(m[1] as string);
      if (!seg) return undefined; // already reported by the model builder
      out.push(seg);
      continue;
    }
    const key = toCamel(raw);
    if (key === "" || !isIdentifier(key)) {
      error(
        "INVALID_SEGMENT",
        `${op.method.toUpperCase()} ${op.path}: segment "${raw}" cannot be turned into a property name. Use overrides.operations.${op.id}.path.`,
      );
      return undefined;
    }
    out.push({ key, origin: raw });
  }
  return out;
}
