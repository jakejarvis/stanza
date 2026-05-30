/**
 * Kind of app a framework module targets. The closed enum lets the runtime
 * validate "you can't install Next.js into a `kind: \"native\"` app" — add new
 * kinds here as they're introduced (and the schema picks them up).
 */
export const APP_KINDS = ["web", "native"] as const;
export type AppKind = (typeof APP_KINDS)[number];

/** Where a category's install fields and `scope`-derived templates land. */
export type InstallHome =
  | { kind: "app" } // an app entry in manifest.apps[] (selected per install)
  | { kind: "repo" } // monorepo root
  | { kind: "package"; dir: string }; // packages/<dir>/, named @<name>/<dir>

/** How many modules a category holds: a single choice, or several coexisting. */
export type Cardinality = "one" | "many";

export type Category = {
  id: CategoryId;
  label: string;
  description: string;
  /** `"one"` → single-choice (framework, auth); `"many"` → coexist (testing). */
  cardinality: Cardinality;
  /** Install destination for this category's modules. */
  home: InstallHome;
};

/**
 * Single source of truth for categories — `CategoryId` and `KNOWN_CATEGORIES`
 * derive from this, so adding one is a one-place edit. Order is topological:
 * a category appears after every category it can peer on, and `many` (leaf)
 * categories come last. It's also the wizard prompt + processing order.
 *
 * Constraint-bearing is emergent: a category is a peer candidate iff some
 * module declares `peers`/`match` against it. The resolver only treats
 * `cardinality: "one"` categories as peers (`PEER_CATEGORIES`).
 */
export const CATEGORIES = [
  {
    id: "framework",
    label: "Framework",
    description: "Web and native app frameworks.",
    cardinality: "one",
    home: { kind: "app" },
  },
  {
    id: "ui",
    label: "UI",
    description: "Styling systems and component primitives.",
    cardinality: "one",
    home: { kind: "package", dir: "ui" },
  },
  {
    id: "api",
    label: "API",
    description: "Typed RPC layer between the framework and your services.",
    cardinality: "one",
    home: { kind: "package", dir: "api" },
  },
  {
    id: "db",
    label: "Database",
    description: "Database engines.",
    cardinality: "one",
    home: { kind: "package", dir: "db" },
  },
  {
    id: "orm",
    label: "ORM",
    description: "Typed query layers over your database.",
    cardinality: "one",
    home: { kind: "package", dir: "db" },
  },
  {
    id: "auth",
    label: "Auth",
    description: "Authentication providers and session handling.",
    cardinality: "one",
    home: { kind: "package", dir: "auth" },
  },
  {
    id: "payments",
    label: "Payments",
    description: "Checkout, customer portal, and webhooks.",
    cardinality: "one",
    home: { kind: "package", dir: "payments" },
  },
  {
    id: "email",
    label: "Email",
    description: "Transactional email providers and templates.",
    cardinality: "one",
    home: { kind: "package", dir: "email" },
  },
  {
    id: "ai",
    label: "AI",
    description: "AI SDK and provider wiring.",
    cardinality: "one",
    home: { kind: "package", dir: "ai" },
  },
  {
    id: "tooling",
    label: "Tooling",
    description: "Linter and formatter toolchains.",
    cardinality: "one",
    home: { kind: "repo" },
  },
  {
    id: "testing",
    label: "Testing",
    description: "Test runners — unit and end-to-end.",
    cardinality: "many",
    home: { kind: "app" },
  },
  {
    id: "deploy",
    label: "Deploy",
    description: "Deploy targets.",
    cardinality: "many",
    home: { kind: "repo" },
  },
  {
    id: "monorepo",
    label: "Monorepo",
    description: "Workspace task orchestrators.",
    cardinality: "one",
    home: { kind: "repo" },
  },
  // Inline shape (not `Category`) so `CategoryId` derives without a cycle.
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  cardinality: Cardinality;
  home: InstallHome;
}[];

/** Legal category ids, derived from `CATEGORIES`. */
export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** Category ids as a non-empty tuple — the shape `z.enum` needs. Also the processing order. */
const [firstCategory, ...restCategories] = CATEGORIES;
export const KNOWN_CATEGORIES: [CategoryId, ...CategoryId[]] = [
  firstCategory.id,
  ...restCategories.map((c) => c.id),
];

/** Runtime guard narrowing an arbitrary string to a known `CategoryId`. */
export function isCategoryId(value: string): value is CategoryId {
  return KNOWN_CATEGORIES.some((id) => id === value);
}

// `Object.fromEntries` widens keys to `string`; CATEGORIES covers every
// CategoryId by construction, so narrowing to the exhaustive record is sound.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  Category
>;

/** Display name — used by the wizard, summary, and CLI/web list output. */
export function categoryLabel(id: CategoryId): string {
  return CATEGORY_BY_ID[id].label;
}

/** One-line blurb — used as the category landing-page subtitle. */
export function categoryDescription(id: CategoryId): string {
  return CATEGORY_BY_ID[id].description;
}

/** Install destination for a category's modules. */
export function categoryHome(id: CategoryId): InstallHome {
  return CATEGORY_BY_ID[id].home;
}

export function categoryCardinality(id: CategoryId): Cardinality {
  return CATEGORY_BY_ID[id].cardinality;
}

/** True for multi-choice categories (testing, deploy, …). */
export function isMulti(id: CategoryId): boolean {
  return CATEGORY_BY_ID[id].cardinality === "many";
}

/**
 * Categories that can be peers — only `cardinality: "one"` ones, since you
 * dispatch on "the framework", not on a set. The resolver iterates these.
 */
export const PEER_CATEGORIES = CATEGORIES.filter((c) => c.cardinality === "one").map(
  (c) => c.id,
) as CategoryId[];

/** Unique package dirs across all categories (for cross-package wiring + sweep). */
export const PACKAGE_DIRS: Set<string> = new Set(
  CATEGORIES.flatMap((c) => (c.home.kind === "package" ? [c.home.dir] : [])),
);

/** A module id — interned into manifests and registry URLs. */
export type ModuleId = string;
