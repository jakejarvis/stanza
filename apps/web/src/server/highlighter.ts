/**
 * Client-safe types for the syntax-highlighter. The Shiki runtime that
 * produces these lives in `highlighter.server.ts` (server-only). Keeping the
 * `Preview` type here lets client components (`file-preview.tsx`,
 * `templates-list.tsx`) import it without pulling Shiki into the browser bundle.
 */
export type Preview = { light: string; dark: string };
