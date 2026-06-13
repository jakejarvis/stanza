import { describe, expect, it } from "vite-plus/test";

import type { PlanAction } from "./codemod-runner";
import { formatPlanLines, summarizePlan } from "./plan-format";

const sample: PlanAction[] = [
  { op: "create", path: "apps/web/proxy.ts", detail: "template" },
  { op: "modify", path: "apps/web/src/app/layout.tsx", detail: "codemod wrap-root-layout" },
  {
    op: "skip",
    path: "apps/web/package.json",
    detail: "dependency react",
    reason: "newer version already pinned",
  },
];

describe("summarizePlan", () => {
  it("tallies each op, omitting empty buckets", () => {
    expect(summarizePlan(sample)).toBe("1 created, 1 modified, 1 skipped");
    expect(summarizePlan([{ op: "create", path: "a", detail: "template" }])).toBe("1 created");
  });

  it("reports no changes for an empty plan", () => {
    expect(summarizePlan([])).toBe("no changes");
  });
});

describe("formatPlanLines", () => {
  it("renders one line per action with op, path, and detail", () => {
    const lines = formatPlanLines(sample);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("create");
    expect(lines[0]).toContain("apps/web/proxy.ts");
    expect(lines[1]).toContain("codemod wrap-root-layout");
  });

  it("appends the reason on skip actions", () => {
    const line = formatPlanLines(sample).find((l) => l.includes("react"));
    expect(line).toContain("newer version already pinned");
  });

  it("notes when there are no file changes", () => {
    expect(formatPlanLines([]).join("\n")).toContain("no file changes");
  });
});
