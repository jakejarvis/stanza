/**
 * Reads registry data from the Nitro server-asset storage. `.registry/` (the
 * build-time compiled copy, not committed) is registered as a `serverAssets`
 * dir (see vite.config.ts), so its contents are embedded into the server bundle
 * at build time — readable on serverless hosts (Vercel) where the function fs
 * is otherwise empty. This is the web's own render input; the public surface
 * (CLI, editors) reads the same registry from Vercel Blob via the
 * `stanza.tools/registry/*.json` rewrites.
 *
 * We read from storage instead of fetching the public URL because prod SSR
 * loopback connections get refused.
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
    const filePath = resolve(process.cwd(), ".registry", relativePath);
    try {
      const parsed: T = JSON.parse(await readFile(filePath, "utf8"));
      return parsed;
    } catch {
      throw new Error(
        `Registry asset not found: ${filePath} (run \`vp run compile-registry\` to populate apps/web/.registry/)`,
      );
    }
  }

  let data: unknown;
  try {
    data = await useStorage("assets:registry").getItem(relativePath);
  } catch (cause) {
    throw new Error(`Registry asset read failed: assets:registry:${relativePath}`, { cause });
  }
  if (data == null) {
    throw new Error(`Registry asset not found: assets:registry:${relativePath}`);
  }
  // unstorage destr-parses JSON, but be explicit if a driver returns raw text.
  let value: unknown;
  try {
    value = typeof data === "string" ? JSON.parse(data) : data;
  } catch (cause) {
    throw new Error(`Registry asset is not valid JSON: assets:registry:${relativePath}`, { cause });
  }
  // Registry assets are first-party build output; the caller declares the shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as T;
}
