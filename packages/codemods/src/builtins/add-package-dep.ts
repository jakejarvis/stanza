import path from "node:path";

import { addPackageDependency, type Codemod, removePackageDependency } from "../index";

/**
 * Add a dep to a package.json. Use the declarative `dependencies` /
 * `devDependencies` fields when the dep belongs in the module's own package;
 * reach for this only for cross-package wiring (e.g., the polar/stripe
 * `+better-auth` bridges adding `{{packages.payments.name}}` to
 * `packages/auth/package.json`).
 */
export type AddPackageDepArgs = {
  /**
   * Which package.json receives the dep:
   *  - `"repo"`: `<projectRoot>/package.json` — repo-root
   *  - `"app"` (default): `<appRoot>/package.json` — active app
   *  - `"package:<dir>"`: `<projectRoot>/packages/<dir>/package.json`
   */
  base?: "app" | "repo" | `package:${string}`;
  /** Dep name (after mustache substitution), e.g. `"@my-app/payments"`. */
  name: string;
  /** Version range. Defaults to `"workspace:*"`. */
  range?: string;
  /** Add to `devDependencies` instead of `dependencies`. Defaults to false. */
  dev?: boolean;
};

const addPackageDep: Codemod<AddPackageDepArgs> = {
  id: "add-package-dep",
  description: "Add a dependency entry to a target package.json.",

  apply(ctx, args) {
    const pkgJsonPath = resolvePackageJsonPath(ctx, args);
    const rel = path.relative(ctx.projectRoot, pkgJsonPath);
    const range = args.range ?? "workspace:*";

    // Claim before writing: the runner snapshots the file on claim, and the
    // snapshot must capture the pre-write bytes for rollback to restore them.
    const depKey = args.dev ? "devDependencies" : "dependencies";
    ctx.claimRegion(rel, `${depKey}.${args.name}`);

    addPackageDependency(pkgJsonPath, args.name, range, { dev: args.dev });

    return { touchedFiles: [rel] };
  },

  revert(ctx, args) {
    const pkgJsonPath = resolvePackageJsonPath(ctx, args);
    const rel = path.relative(ctx.projectRoot, pkgJsonPath);

    removePackageDependency(pkgJsonPath, args.name);

    const depKey = args.dev ? "devDependencies" : "dependencies";
    ctx.releaseRegion(rel, `${depKey}.${args.name}`);

    return { touchedFiles: [rel] };
  },
};

function resolvePackageJsonPath(
  ctx: { projectRoot: string; appRoot: string },
  args: AddPackageDepArgs,
): string {
  const base = args.base ?? "app";
  if (base.startsWith("package:")) {
    return path.join(ctx.projectRoot, "packages", base.slice("package:".length), "package.json");
  }
  return path.join(base === "repo" ? ctx.projectRoot : ctx.appRoot, "package.json");
}

export default addPackageDep;
