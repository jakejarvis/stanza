import * as p from "@clack/prompts";
import type { AppSpec, StanzaManifest } from "@stanza/registry";
import {
  categoryHome,
  DEFAULT_NAMESPACE,
  isCategoryId,
  isMulti,
  KNOWN_CATEGORIES,
  parseModuleSpec,
  resolveAdapter,
  selectedAll,
} from "@stanza/registry";
import { defineCommand } from "citty";
import pc from "picocolors";

import { applyModule } from "../lib/codemod-runner";
import { ensureCleanWorktree } from "../lib/git";
import { findProjectRoot, readManifest, writeManifest } from "../lib/manifest";
import { regenerateReadmeIfUnmodified } from "../lib/readme";
import { loadRegistries, pickRegistryRoot } from "../lib/registry-loader";
import * as telemetry from "../lib/telemetry";
import { commonArgs, type CliArgs } from "./_args";

export const add = defineCommand({
  meta: { name: "add", description: "Add a module to the current project." },
  args: {
    slot: { type: "positional", required: true, description: "Category." },
    moduleId: { type: "positional", required: true, description: "Module id." },
    app: {
      type: "string",
      description: "Target app id (required for multi-app projects; auto-picked otherwise).",
    },
    ...commonArgs,
  },
  run: ({ args }) => cmdAdd(args),
});

export async function cmdAdd(args: CliArgs): Promise<void> {
  const slot = typeof args.slot === "string" ? args.slot : undefined;
  const rawModuleId = typeof args.moduleId === "string" ? args.moduleId : undefined;
  if (!slot || !rawModuleId) {
    p.log.error("Usage: stanza add <category> [@<namespace>/]<module>");
    process.exitCode = 1;
    return;
  }

  if (!isCategoryId(slot)) {
    p.log.error(`Unknown category: ${slot}. Categories: ${KNOWN_CATEGORIES.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const category = slot;
  const group = category;

  // Split `@ns/id` into a namespace + id. Bare ids implicitly mean `@stanza`,
  // which we leave as `undefined` on the record (omitted = default).
  const { namespace, id: moduleId } = parseModuleSpec(rawModuleId);

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found in this or any parent directory.");
    process.exitCode = 1;
    return;
  }

  const dryRun = Boolean(args["dry-run"]);
  if (!dryRun && !ensureCleanWorktree(projectRoot, Boolean(args["dangerously-allow-dirty"]))) {
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(projectRoot);
  const home = categoryHome(category);
  const appFlag = typeof args.app === "string" ? args.app : undefined;

  // Pick target apps based on the module's home.
  //  - home: "app"     — exactly one app, picked via cwd/flag/prompt.
  //  - home: "package" — defaults to all apps (shims everywhere); the user can
  //                       narrow with --app=<id>.
  //  - home: "repo"    — no app picking; seed with the first app for context.
  let targetApps: AppSpec[];
  let pickedAppId: string | undefined;
  if (home.kind === "app") {
    const picked = await pickTargetApp({
      manifest,
      appFlag,
      cwd: process.cwd(),
      projectRoot,
      reason: `Which app should ${pc.cyan(`${category}/${moduleId}`)} install into?`,
    });
    if (!picked) {
      process.exitCode = 1;
      return;
    }
    targetApps = [picked];
    pickedAppId = picked.id;
  } else if (home.kind === "package") {
    if (appFlag) {
      const picked = manifest.apps.find((a) => a.id === appFlag);
      if (!picked) {
        p.log.error(
          `Unknown app "${appFlag}". Available: ${manifest.apps.map((a) => a.id).join(", ")}.`,
        );
        process.exitCode = 1;
        return;
      }
      targetApps = [picked];
      pickedAppId = picked.id;
    } else {
      targetApps = manifest.apps;
    }
  } else {
    // home: "repo"
    targetApps = [manifest.apps[0]!];
  }

  // Per-app cardinality check for home:"app" categories; per-project for the
  // rest. `selectedAll(manifest, category, appId)` filters to records that
  // target the given app (or are global).
  const existing = selectedAll(manifest, category, pickedAppId);
  if (isMulti(category)) {
    if (existing.some((r) => r.id === moduleId)) {
      const where = pickedAppId ? ` in app "${pickedAppId}"` : "";
      p.log.error(`"${category}/${moduleId}" is already added${where}.`);
      process.exitCode = 1;
      return;
    }
  } else if (existing.length > 0) {
    const where = pickedAppId ? ` (app "${pickedAppId}")` : "";
    p.log.error(
      `Category "${category}"${where} is already filled by "${existing[0]!.id}". ` +
        `Run \`stanza remove ${category}${pickedAppId ? ` --app=${pickedAppId}` : ""}\` first.`,
    );
    process.exitCode = 1;
    return;
  }

  const registry = await loadRegistries(manifest);
  let mod;
  try {
    mod = await registry.loadModule(group, moduleId, namespace);
  } catch (err) {
    const where = namespace ? `${namespace}/` : "";
    p.log.error(
      `Could not load ${group}/${where}${moduleId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return;
  }

  // Validate appKind matches the target's kind (typically enforces framework→app-kind pairing).
  if (home.kind === "app" && mod.appKind && mod.appKind !== targetApps[0]!.kind) {
    p.log.error(
      `${category}/${moduleId} targets ${pc.cyan(mod.appKind)} apps but "${targetApps[0]!.id}" is ${pc.cyan(targetApps[0]!.kind)}.`,
    );
    process.exitCode = 1;
    return;
  }

  const resolved = resolveAdapter(mod, { manifest, pending: {}, targetAppId: pickedAppId });
  if (!resolved.ok) {
    p.log.error(`Cannot add ${mod.label}: ${describeResolveError(resolved.error.kind)}`);
    process.exitCode = 1;
    return;
  }

  const spinner = p.spinner();
  spinner.start(`Adding ${mod.label}`);

  // Third-party modules ship templates inlined and don't need a local
  // registry root. For @stanza we still surface the local FS path so dev-mode
  // (FS) registry runs can read template files that aren't inlined yet.
  const registryRoot = pickRegistryRoot(namespace ?? DEFAULT_NAMESPACE);
  let result;
  try {
    result = await applyModule({
      projectRoot,
      manifest,
      module: mod,
      adapter: resolved.adapter,
      targetApps,
      registryRoot,
      dryRun,
      namespace,
    });
  } catch (err) {
    spinner.stop(`${mod.label} ${pc.red("failed")}`);
    throw err;
  }

  // Always counted in the aggregate install total; the `namespace` property
  // lets the stats page exclude third-party modules from per-category
  // leaderboards (where ranking private/proprietary ids alongside first-party
  // ones would be misleading).
  telemetry.capture("cli_module", {
    action: "install",
    group,
    module: mod.id,
    namespace: namespace ?? DEFAULT_NAMESPACE,
  });
  spinner.stop(`${pc.green("✓")} ${mod.label} added`);
  if (result.bootstrappedPackage) {
    const { name } = result.bootstrappedPackage;
    p.log.info(`Run ${pc.cyan("pnpm install")} to link ${pc.cyan(name)}.`);
  }

  // Refresh the project README to reflect the new selection — but only if the
  // user hasn't edited it. `applyModule` has already written the manifest.
  const regen = await regenerateReadmeIfUnmodified({
    projectRoot,
    manifest: result.manifest,
    registry,
    dryRun,
  });
  if (regen.status === "written" && !dryRun) writeManifest(projectRoot, regen.manifest);
  if (regen.status === "skipped") {
    p.log.warn("Skipped README.md refresh (user-modified). Delete the file to regenerate.");
  }

  if (dryRun) p.log.info(pc.yellow("[dry-run] no files were written"));
}

/**
 * Resolve which app to target for a `home:"app"` module. Order:
 *  1. `--app=<id>` flag wins.
 *  2. Single-app project auto-targets.
 *  3. Interactive TTY → prompt the user to pick.
 *  4. Otherwise (multi-app + non-TTY) → fail with a clear "specify --app" message.
 */
async function pickTargetApp(args: {
  manifest: StanzaManifest;
  appFlag: string | undefined;
  cwd: string;
  projectRoot: string;
  reason: string;
}): Promise<AppSpec | null> {
  const { manifest, appFlag, cwd, projectRoot, reason } = args;
  if (appFlag) {
    const picked = manifest.apps.find((a) => a.id === appFlag);
    if (!picked) {
      p.log.error(
        `Unknown app "${appFlag}". Available: ${manifest.apps.map((a) => a.id).join(", ")}.`,
      );
      return null;
    }
    return picked;
  }
  if (manifest.apps.length === 1) return manifest.apps[0]!;

  // Cwd inference: if you're inside one of the app dirs, that's the target.
  const inferred = manifest.apps.find((a) => {
    const abs = `${projectRoot.replace(/\/+$/, "")}/${a.dir.replace(/\/+$/, "")}`;
    return cwd === abs || cwd.startsWith(`${abs}/`);
  });
  if (inferred) return inferred;

  // Interactive prompt — only when the user is on a TTY and didn't pass --yes.
  if (process.stdin.isTTY) {
    const picked = await p.select({
      message: reason,
      options: manifest.apps.map((a) => ({
        value: a.id,
        label: a.id,
        hint: `${a.dir} · ${a.kind}`,
      })),
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      return null;
    }
    return manifest.apps.find((a) => a.id === picked) ?? null;
  }

  p.log.error(
    `This project has multiple apps (${manifest.apps.map((a) => a.id).join(", ")}). ` +
      `Specify which with \`--app=<id>\`.`,
  );
  return null;
}

function describeResolveError(kind: string): string {
  switch (kind) {
    case "missing-peer":
      return "a required peer module isn't installed.";
    case "incompatible-peer":
      return "the installed peer module isn't supported.";
    case "no-adapter":
      return "no adapter matches your current stack.";
    default:
      return kind;
  }
}
