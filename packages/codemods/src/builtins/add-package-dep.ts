import path from "node:path";

import { addPackageDependency, type Codemod, removePackageDependency } from "../index";

/**
 * Idempotently add a dependency entry to a package.json. Used when an adapter
 * needs to wire a cross-package workspace dep that doesn't live in the
 * module's own package — e.g., the `payments-polar +better-auth` bridge
 * adapter has to add `{{packages.payments.name}}: workspace:*` to
 * `packages/auth/package.json` so the modified `auth.ts` can import from it.
 *
 * For the common case of adding deps to *this* module's own package, prefer
 * the declarative `dependencies` / `devDependencies` fields on the module or
 * adapter — they route via `installPackageJsonTargets` automatically.
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

    addPackageDependency(pkgJsonPath, args.name, range, { dev: args.dev });

    const depKey = args.dev ? "devDependencies" : "dependencies";
    ctx.claimRegion(rel, `${depKey}.${args.name}`);

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
