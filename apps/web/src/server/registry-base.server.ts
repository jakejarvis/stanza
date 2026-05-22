/**
 * Reads registry data from the Nitro server-asset storage. `public/registry/`
 * is registered as a `serverAssets` dir (see vite.config.ts), so its contents
 * are embedded into the server bundle at build time — readable on serverless
 * hosts (Vercel) where `public/` lives only on the CDN, not in the function fs.
 * The same files are still served statically at `/registry/` for the CLI.
 *
 * We read from storage instead of fetching ourselves because prod SSR loopback
 * connections get refused.
 *
 * Dev caveat: TanStack Start's server functions execute in Vite's `ssr`
 * environment, but Nitro only injects the real `#nitro/virtual/storage`
 * (with the mounted serverAssets) into its own `nitro` environment. Outside it,
 * `useStorage` resolves to an empty stub, so `assets:registry` reads return
 * null. In dev we therefore read the same files straight off disk; the
 * serverAssets path is prod-only (where everything bundles into one server).
 *
 * @see https://nitro.build/docs/assets#server-assets
 */
import { useStorage } from "nitro/storage";

export async function loadRegistryFile<T>(relativePath: string): Promise<T> {
  if (import.meta.env.DEV) {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const filePath = resolve(process.cwd(), "public/registry", relativePath);
    try {
      const parsed: T = JSON.parse(await readFile(filePath, "utf8"));
      return parsed;
    } catch {
      throw new Error(
        `Registry asset not found: ${filePath} (run \`pnpm --filter @stanza/web prebuild\` to populate public/registry/)`,
      );
    }
  }

  const data = await useStorage("assets:registry").getItem(relativePath);
  if (data == null) {
    throw new Error(`Registry asset not found: assets:registry:${relativePath}`);
  }
  // unstorage destr-parses JSON, but be explicit if a driver returns raw text.
  const value: unknown = typeof data === "string" ? JSON.parse(data) : data;
  // Registry assets are first-party build output; the caller declares the shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as T;
}
