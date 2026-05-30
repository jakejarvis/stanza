# @withstanza/schema

The contract types and [Zod](https://zod.dev) schemas behind [Stanza](https://stanza.tools) — the shape of a `stanza.json` manifest, a registry module, and the registry index, in one place.

`StanzaManifestSchema` is the single source of truth for the JSON Schema published at **<https://stanza.tools/schema.json>** (the value a manifest's `$schema` points at), so editors, the CLI, and third-party registry authors all validate against the same definitions.

> [!WARNING]
> **Major work in progress.** The schema is pre-1.0 and still evolving — see the [registry roadmap](https://stanza.tools/docs/registry).

## Install

```sh
npm install @withstanza/schema
```

## What's in it

- **`defineModule(...)`** — identity helper for authoring a registry module's `module.ts`; validates illegal field combinations at runtime.
- **`ModuleSchema` / `ModuleMetadataSchema` / `RegistryIndexSchema`** — runtime validation for fetched registry JSON.
- **`StanzaManifestSchema`** + manifest helpers (`emptyManifest`, `selectedOne`, `selectedAll`, `appsForRecord`, `declaredEnvNames`, …) and `CURRENT_MANIFEST_VERSION` / `MANIFEST_SCHEMA_URL`.
- **`CATEGORIES`** and the category helpers (`categoryHome`, `categoryLabel`, `categoryCardinality`, `isMulti`, `PEER_CATEGORIES`, `PACKAGE_DIRS`, …) — the canonical category list.
- **`RegistriesSchema` / `parseModuleSpec` / `expandEnv`** — third-party registry config and `@<ns>/<id>` parsing.
- **`PackageManagerSchema`** and the full set of contract types (`Module`, `ModuleAdapter`, `StanzaManifest`, `Category`, `CategoryId`, `TemplateRef`, `EnvVar`, …).

## Usage

```ts
import { defineModule, StanzaManifestSchema, CATEGORIES } from "@withstanza/schema";

// Author a module (in a registry's module.ts):
export default defineModule({
  id: "cosmos",
  category: "testing",
  label: "Cosmos",
  description: "Visual component sandbox.",
  version: "1.0.0",
  adapters: [{ key: "default", match: {} }],
});

// Validate a stanza.json you loaded yourself:
const manifest = StanzaManifestSchema.parse(JSON.parse(raw));
```

Most consumers reach this through [`stanza-cli`](https://www.npmjs.com/package/stanza-cli) rather than directly. Full guides — including [module authoring](https://stanza.tools/docs/authoring) — live at **[stanza.tools/docs](https://stanza.tools/docs)**.

## License

[MIT](https://github.com/jakejarvis/stanza/blob/main/LICENSE)
