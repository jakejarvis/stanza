import pc from "picocolors";

import type { PlanAction } from "./codemod-runner";

/**
 * Render a module's apply plan as aligned, colorized lines for the terminal.
 * One line per action, columns: op, repo-relative path, detail. `skip` actions
 * append their reason. Pure except for color codes — used by `add` for the
 * `--dry-run` preview and reusable by other verbs.
 */
export function formatPlanLines(plan: PlanAction[]): string[] {
  if (plan.length === 0) return [pc.dim("  (no file changes)")];
  const pathWidth = Math.min(Math.max(...plan.map((a) => a.path.length)), 48);
  return plan.map((a) => {
    const op = colorOp(a.op).padEnd(6 + colorPad(a.op));
    const file = a.path.padEnd(pathWidth);
    const detail = a.reason ? `${a.detail} ${pc.dim(`— ${a.reason}`)}` : pc.dim(a.detail);
    return `  ${op}  ${file}  ${detail}`;
  });
}

/**
 * One-line tally for post-apply / dry-run footers, e.g.
 * "1 created, 3 modified, 1 skipped". Omits zero buckets; returns
 * "no changes" when the plan is empty.
 */
export function summarizePlan(plan: PlanAction[]): string {
  const counts = { create: 0, modify: 0, skip: 0 };
  for (const a of plan) counts[a.op] += 1;
  const parts: string[] = [];
  if (counts.create) parts.push(`${counts.create} created`);
  if (counts.modify) parts.push(`${counts.modify} modified`);
  if (counts.skip) parts.push(`${counts.skip} skipped`);
  return parts.length ? parts.join(", ") : "no changes";
}

function colorOp(op: PlanAction["op"]): string {
  if (op === "create") return pc.green("create");
  if (op === "modify") return pc.yellow("modify");
  return pc.dim("skip");
}

// picocolors wraps the label in escape codes, so `padEnd` would count those
// invisible bytes. Add back the wrapper width so columns still line up.
function colorPad(op: PlanAction["op"]): number {
  const label = op === "skip" ? "skip" : op;
  return colorOp(op).length - label.length;
}
