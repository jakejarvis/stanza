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
 * @see https://nitro.build/docs/assets#server-assets
 */
import { useStorage } from "nitro/storage";

export async function loadRegistryFile<T>(relativePath: string): Promise<T> {
  const data = await useStorage("assets:registry").getItem(relativePath);
  if (data == null) {
    throw new Error(`Registry asset not found: assets:registry:${relativePath}`);
  }
  // unstorage destr-parses JSON, but be explicit if a driver returns raw text.
  return (typeof data === "string" ? JSON.parse(data) : data) as T;
}
