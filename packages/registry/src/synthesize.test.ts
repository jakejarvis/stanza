import { defineModule, type Module } from "@withstanza/schema";
import { describe, expect, it } from "vite-plus/test";

import type { Resolved } from "./package-json";
import { ENV_EXAMPLE_HEADER, synthesizeEnvExample, synthesizeReadme } from "./synthesize";

const nextMod: Module = defineModule({
  id: "next",
  category: "framework",
  label: "Next.js",
  description: "React framework with App Router.",
  version: "0.1.0",
  appKind: "web",
  adapters: [{ key: "default", match: {} }],
  readme: 'Start with `{{run "dev"}}` and open <http://localhost:3000>.',
});

const postgresMod: Module = defineModule({
  id: "postgres",
  category: "db",
  label: "PostgreSQL",
  description: "Postgres via the `postgres` driver.",
  version: "0.1.0",
  adapters: [
    { key: "default", match: {}, env: [{ name: "DATABASE_URL", example: "x", required: true }] },
  ],
  readme: "Set `DATABASE_URL`. Shared client exported from `{{packages.db.name}}`.",
});

// No `readme` — exercises the description fallback path.
const drizzleMod: Module = defineModule({
  id: "drizzle",
  category: "orm",
  label: "Drizzle",
  description: "Type-safe ORM.",
  version: "0.1.0",
  adapters: [{ key: "default", match: {} }],
});

const authMod: Module = defineModule({
  id: "better-auth",
  category: "auth",
  label: "Better Auth",
  description: "Auth library.",
  version: "0.1.0",
  adapters: [{ key: "default", match: {} }],
  readme:
    '{{#if (eq peers.framework "next")}}Set BETTER_AUTH_SECRET for Next.js.{{/if}}{{#if (eq peers.framework "tanstack-start")}}Set BETTER_AUTH_SECRET for TanStack Start.{{/if}}',
});

describe("synthesizeReadme", () => {
  it("renders a header, getting-started block, and per-module sections", () => {
    const resolved: Resolved = {
      framework: [{ module: nextMod, adapter: nextMod.adapters[0]! }],
      db: [{ module: postgresMod, adapter: postgresMod.adapters[0]! }],
    };
    const out = synthesizeReadme(resolved, { name: "acme", packageManager: "pnpm" });
    expect(out).toContain("# acme");
    expect(out).toContain("## Stack");
    expect(out).toContain("| Framework | Next.js |");
    expect(out).toContain("| Database | PostgreSQL |");
    expect(out).toContain("## Getting started");
    expect(out).toContain("pnpm install");
    expect(out).toContain("pnpm dev");
    expect(out).toContain("Copy `.env.example`");
    expect(out).toContain("### Framework — Next.js");
    expect(out).toContain("Start with `pnpm dev`"); // {{run "dev"}} → pnpm dev
    expect(out).toContain("### Database — PostgreSQL");
    expect(out).toContain("@acme/db");
  });

  it("renders package-manager-specific install/dev commands", () => {
    const resolved: Resolved = {
      framework: [{ module: nextMod, adapter: nextMod.adapters[0]! }],
    };
    const out = synthesizeReadme(resolved, { name: "acme", packageManager: "bun" });
    expect(out).toContain("bun install");
    expect(out).toContain("bun dev");
    expect(out).not.toContain("pnpm");
  });

  it("uses `npm run <script>` for npm (helper handles the verb difference)", () => {
    const resolved: Resolved = {
      framework: [{ module: nextMod, adapter: nextMod.adapters[0]! }],
    };
    const out = synthesizeReadme(resolved, { name: "acme", packageManager: "npm" });
    expect(out).toContain("npm install");
    expect(out).toContain("npm run dev"); // both the getting-started block and {{run "dev"}}
    expect(out).not.toContain("npm dev"); // bare `npm <script>` would be wrong
  });

  it("falls back to the module description when readme is absent", () => {
    const resolved: Resolved = {
      orm: [{ module: drizzleMod, adapter: drizzleMod.adapters[0]! }],
    };
    const out = synthesizeReadme(resolved, { name: "acme" });
    expect(out).toContain("### ORM — Drizzle");
    expect(out).toContain("> Type-safe ORM.");
  });

  it("renders peer-conditional Handlebars blocks", () => {
    const resolved: Resolved = {
      auth: [{ module: authMod, adapter: authMod.adapters[0]! }],
    };
    const withNext = synthesizeReadme(resolved, { name: "acme", peers: { framework: "next" } });
    const withTanstack = synthesizeReadme(resolved, {
      name: "acme",
      peers: { framework: "tanstack-start" },
    });
    expect(withNext).toContain("Set BETTER_AUTH_SECRET for Next.js.");
    expect(withNext).not.toContain("for TanStack Start");
    expect(withTanstack).toContain("Set BETTER_AUTH_SECRET for TanStack Start.");
    expect(withTanstack).not.toContain("for Next.js");
  });

  it("omits the env-file hint when no module declares env vars", () => {
    const resolved: Resolved = {
      framework: [{ module: nextMod, adapter: nextMod.adapters[0]! }],
    };
    const out = synthesizeReadme(resolved, { name: "acme" });
    expect(out).not.toContain("Copy `.env.example`");
  });

  it("emits a minimal header when no modules are selected", () => {
    const out = synthesizeReadme({}, { name: "acme" });
    expect(out).toContain("# acme");
    expect(out).not.toContain("## Stack");
    expect(out).not.toContain("## Modules");
    expect(out).toContain("## Getting started");
  });
});

describe("synthesizeEnvExample", () => {
  it("emits just the header when no module declares env", () => {
    const resolved: Resolved = {
      framework: [{ module: nextMod, adapter: nextMod.adapters[0]! }],
    };
    expect(synthesizeEnvExample(resolved)).toBe(ENV_EXAMPLE_HEADER);
  });

  it("includes module-level env entries", () => {
    const resolved: Resolved = {
      db: [{ module: postgresMod, adapter: postgresMod.adapters[0]! }],
    };
    const out = synthesizeEnvExample(resolved);
    expect(out).toContain("DATABASE_URL=");
  });

  it("includes app-overlay env entries (CLI writes both into .env.example)", () => {
    const uiWithAppEnv: Module = defineModule({
      id: "shadcn-base",
      category: "ui",
      label: "Shadcn",
      description: "",
      version: "0.1.0",
      app: { env: [{ name: "POSTHOG_API_KEY", example: "phc_xxx", required: false }] },
      adapters: [{ key: "default", match: {} }],
    });
    const resolved: Resolved = {
      ui: [{ module: uiWithAppEnv, adapter: uiWithAppEnv.adapters[0]! }],
    };
    const out = synthesizeEnvExample(resolved);
    expect(out).toContain("POSTHOG_API_KEY=phc_xxx");
  });
});
