#!/usr/bin/env bun
/**
 * Scaffold a new first-party module under registry/modules/<slot>-<id>/.
 *
 * Usage:
 *   bun module:new                        — fully interactive
 *   bun module:new <slot> <id>            — positional, prompts for the rest
 *   bun module:new <slot> <id> [flags]    — non-interactive
 *
 * Flags:
 *   --label "Display Name"        Default: title-cased id
 *   --description "..."           Default: empty
 *   --homepage <url>              Optional
 *   --with-codemod                Scaffold an empty codemods/ directory
 *   --yes                         Skip all prompts (use defaults for everything)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as p from "@clack/prompts";
import { KNOWN_SLOTS, type SlotId } from "@stanza/registry";
import kleur from "kleur";
import mri from "mri";

type Args = {
  slot?: SlotId;
  id?: string;
  label?: string;
  description?: string;
  homepage?: string;
  withCodemod: boolean;
};

await main();

async function main() {
  const argv = mri(process.argv.slice(2), {
    boolean: ["with-codemod", "yes", "help"],
    alias: { h: "help" },
  });

  if (argv.help) {
    printHelp();
    return;
  }

  const args = await gatherArgs(argv);
  if (!args) return;

  const repoRoot = findRepoRoot();
  const moduleDir = path.join(repoRoot, "registry", "modules", `${args.slot}-${args.id}`);

  if (fs.existsSync(moduleDir)) {
    p.log.error(`Module already exists: ${path.relative(repoRoot, moduleDir)}`);
    process.exitCode = 1;
    return;
  }

  writeModule({ moduleDir, repoRoot, args });

  p.outro(
    [
      kleur.green("✓ Module scaffolded:"),
      `  ${kleur.dim(path.relative(repoRoot, moduleDir))}`,
      "",
      "Next steps:",
      `  ${kleur.dim("1.")} Edit ${kleur.cyan(`registry/modules/${args.slot}-${args.id}/module.ts`)}`,
      `  ${kleur.dim("2.")} Add templates under ${kleur.cyan("templates/")}`,
      `  ${kleur.dim("3.")} ${kleur.cyan("pnpm install --force")} to link the workspace`,
      `  ${kleur.dim("4.")} ${kleur.cyan("pnpm registry:build")} to verify the manifest`,
    ].join("\n"),
  );
}

async function gatherArgs(argv: mri.Argv): Promise<Args | null> {
  const positional = argv._;
  const yes = Boolean(argv.yes);

  let slot = (positional[0] as SlotId | undefined) ?? (argv.slot as SlotId | undefined);
  let id = (positional[1] as string | undefined) ?? (argv.id as string | undefined);

  if (!slot || !id) p.intro(kleur.bold().cyan("new stanza module"));

  if (!slot) {
    const choice = await p.select<SlotId>({
      message: "Slot?",
      options: KNOWN_SLOTS.map((s) => ({ value: s, label: s })),
    });
    if (p.isCancel(choice)) return cancel();
    slot = choice;
  } else if (!KNOWN_SLOTS.includes(slot)) {
    p.log.error(`Unknown slot: ${slot}. Known: ${KNOWN_SLOTS.join(", ")}`);
    process.exitCode = 1;
    return null;
  }

  if (!id) {
    const v = await p.text({
      message: "Module id?",
      placeholder: "e.g. resend, polar, vitest",
      validate: (s) =>
        s && /^[a-z][a-z0-9-]*$/.test(s)
          ? undefined
          : "Lowercase letters, digits, dashes; must start with a letter.",
    });
    if (p.isCancel(v)) return cancel();
    id = String(v);
  } else if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    p.log.error(`Invalid id: ${id}. Lowercase letters, digits, dashes only.`);
    process.exitCode = 1;
    return null;
  }

  const label = (argv.label as string | undefined) ?? (yes ? titleCase(id) : await askLabel(id));
  if (label === null) return cancel();

  const description =
    (argv.description as string | undefined) ?? (yes ? "" : ((await askDescription()) ?? ""));
  if (description === null) return cancel();

  const homepage = argv.homepage as string | undefined;

  const withCodemod = Boolean(argv["with-codemod"]) || (!yes ? await askWithCodemod() : false);
  if (withCodemod === null) return cancel();

  return { slot, id, label, description, homepage, withCodemod };
}

async function askLabel(id: string): Promise<string | null> {
  const v = await p.text({
    message: "Display label?",
    initialValue: titleCase(id),
  });
  if (p.isCancel(v)) return null;
  return String(v);
}

async function askDescription(): Promise<string | null> {
  const v = await p.text({
    message: "Description (optional)?",
    placeholder: "One-line summary shown in `stanza search`",
  });
  if (p.isCancel(v)) return null;
  return String(v ?? "");
}

async function askWithCodemod(): Promise<boolean> {
  const v = await p.confirm({
    message: "Scaffold a codemods/ directory? (most modules don't need this)",
    initialValue: false,
  });
  if (p.isCancel(v)) return false;
  return v;
}

function writeModule(args: { moduleDir: string; repoRoot: string; args: Args }) {
  const { moduleDir, args: a } = args;
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.mkdirSync(path.join(moduleDir, "templates"), { recursive: true });

  fs.writeFileSync(path.join(moduleDir, "package.json"), packageJson(a));
  fs.writeFileSync(path.join(moduleDir, "tsconfig.json"), tsconfig(a.withCodemod));
  fs.writeFileSync(path.join(moduleDir, "module.ts"), moduleTs(a));

  // Placeholder so the templates/ dir survives a fresh git clone.
  fs.writeFileSync(
    path.join(moduleDir, "templates", ".gitkeep"),
    "# Templates go here. Reference them from module.ts via `templates: [{ src, dest, scope }]`.\n",
  );

  if (a.withCodemod) {
    fs.mkdirSync(path.join(moduleDir, "codemods"), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, "codemods", "index.ts"), codemodTs(a));
  }
}

function packageJson(a: Args): string {
  const pkg = {
    name: `@stanza-modules/${a.slot}-${a.id}`,
    version: "0.1.0",
    private: true,
    license: "MIT",
    type: "module",
    main: "./module.ts",
    dependencies: {
      "@stanza/codemods": "workspace:*",
      "@stanza/registry": "workspace:*",
    },
    ...(a.withCodemod ? { devDependencies: { "@types/node": "^25.9.1" } } : {}),
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function tsconfig(withCodemod: boolean): string {
  const cfg = {
    extends: "../../../tsconfig.base.json",
    ...(withCodemod ? { compilerOptions: { types: ["node"] } } : {}),
    include: withCodemod ? ["module.ts", "codemods/**/*.ts"] : ["module.ts"],
    exclude: ["templates"],
  };
  return JSON.stringify(cfg, null, 2) + "\n";
}

function moduleTs(a: Args): string {
  const lines = [
    `import { defineModule } from "@stanza/registry";`,
    ``,
    `export default defineModule({`,
    `  id: ${JSON.stringify(a.id)},`,
    `  slot: ${JSON.stringify(a.slot)},`,
    `  label: ${JSON.stringify(a.label)},`,
    `  description: ${JSON.stringify(a.description)},`,
    `  version: "0.1.0",`,
    ...(a.homepage ? [`  homepage: ${JSON.stringify(a.homepage)},`] : []),
    `  // peers: { framework: ["next", "tanstack-start"] },`,
    `  adapters: [`,
    `    {`,
    `      // "default" matches any stack. Add framework/orm/db keys to \`match\``,
    `      // when this adapter only applies to a specific peer combination.`,
    `      key: "default",`,
    `      match: {},`,
    `      // dependencies: { "some-pkg": "^1.0.0" },`,
    `      // devDependencies: { "some-dev-pkg": "^1.0.0" },`,
    `      // env: [{ name: "FOO", example: "bar", required: true }],`,
    `      // scripts: { "some:script": "command" },`,
    `      // templates: [{ src: "config.ts", dest: "config.ts", scope: "app" }],`,
    ...(a.withCodemod ? [`      codemods: [/* "my-codemod" */],`] : []),
    `    },`,
    `  ],`,
    `});`,
    ``,
  ];
  return lines.join("\n");
}

function codemodTs(a: Args): string {
  const codemodId = `${a.id}-setup`;
  return [
    `import type { Codemod } from "@stanza/codemods";`,
    ``,
    `const setup: Codemod = {`,
    `  id: ${JSON.stringify(codemodId)},`,
    `  description: "Imperative setup for ${a.label}.",`,
    `  apply(ctx) {`,
    `    // Open files via \`ctx.project().addSourceFileAtPath(...)\`,`,
    `    // claim regions via \`ctx.claimRegion(file, region)\`,`,
    `    // return the relative paths you touched.`,
    `    return { touchedFiles: [] };`,
    `  },`,
    `  // Optional inverse for \`stanza remove\`.`,
    `  // revert(ctx) { return { touchedFiles: [] }; },`,
    `};`,
    ``,
    `export default {`,
    `  ${JSON.stringify(codemodId)}: setup,`,
    `};`,
    ``,
  ].join("\n");
}

function cancel(): null {
  p.cancel("Cancelled.");
  return null;
}

function titleCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1))
    .join(" ");
}

function findRepoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate repo root.");
}

function printHelp() {
  console.log(`
${kleur.bold("module:new")} — scaffold a new first-party stanza module

${kleur.bold("Usage")}
  bun module:new [slot] [id] [flags]

${kleur.bold("Flags")}
  --label "Display Name"        Default: title-cased id
  --description "..."           Default: empty
  --homepage <url>              Optional
  --with-codemod                Scaffold an empty codemods/ directory
  --yes                         Skip all prompts (use defaults)
  -h, --help                    Show this help

${kleur.bold("Examples")}
  bun module:new                              # fully interactive
  bun module:new email resend                 # prompt only for label/description
  bun module:new ui shadcn-radix --yes        # no prompts
  bun module:new auth workos --with-codemod   # include codemods/index.ts stub
`);
}
