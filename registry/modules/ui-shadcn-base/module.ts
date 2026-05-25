import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "shadcn-base",
  category: "ui",
  label: "shadcn (Base UI)",
  description:
    "shadcn/ui registry preset `base-nova` — Tailwind + Base UI primitives in packages/ui.",
  version: "0.1.0",
  peers: { framework: ["next", "tanstack-start"] },
  homepage: "https://ui.shadcn.com",
  // Everything shadcn pulls in regardless of framework — kept at module level so
  // the two adapters only carry the per-framework deltas.
  dependencies: {
    "@base-ui/react": "^1.5.0",
    "class-variance-authority": "^0.7.1",
    clsx: "^2.1.1",
    "lucide-react": "^1.16.0",
    shadcn: "^4.8.0",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0",
    zod: "^3.25.76",
  },
  devDependencies: { tailwindcss: "^4.1.18" },
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      // next-themes powers shadcn's <ThemeProvider> on Next — class strategy +
      // localStorage + system-pref subscription, all out of the box.
      dependencies: { "next-themes": "^0.4.6" },
      devDependencies: { "@tailwindcss/postcss": "^4.1.18" },
      templates: [
        // packages/ui/ — shared shadcn surface.
        {
          src: "shared/package/src/lib/utils.ts",
          dest: "src/lib/utils.ts",
          scope: "package",
        },
        {
          src: "shared/package/src/components/button.tsx",
          dest: "src/components/button.tsx",
          scope: "package",
          template: true,
        },
        {
          src: "shared/package/components.json",
          dest: "components.json",
          scope: "package",
          template: true,
        },
        // Next-specific: the oklch theme tokens + postcss plugin config.
        {
          src: "next/package/src/styles/globals.css",
          dest: "src/styles/globals.css",
          scope: "package",
        },
        {
          src: "next/package/postcss.config.mjs",
          dest: "postcss.config.mjs",
          scope: "package",
        },
        // apps/<id>/ — outer shadcn config + ThemeProvider + postcss re-export.
        {
          src: "next/app/components.json",
          dest: "components.json",
          scope: "app",
          template: true,
        },
        {
          src: "next/app/postcss.config.mjs",
          dest: "postcss.config.mjs",
          scope: "app",
          template: true,
        },
        {
          src: "next/app/components/theme-provider.tsx",
          dest: "components/theme-provider.tsx",
          scope: "app",
        },
      ],
      codemods: [
        // Swap the framework's `import "./globals.css"` for the shadcn-managed
        // bundle in packages/ui (oklch tokens + tw-animate-css + the shadcn
        // tailwind base). Done as an in-place replace (not append + comment)
        // because the framework's CSS file becomes orphaned otherwise.
        {
          id: "replace-import",
          args: {
            file: "app/layout.tsx",
            from: "./globals.css",
            to: "{{package.name}}/globals.css",
          },
        },
        // `next-themes` toggles the `dark`/`light` class on <html>; without
        // suppressHydrationWarning React complains on the first paint
        // because the server-rendered class != the client-resolved one.
        {
          id: "set-html-attributes",
          args: {
            file: "app/layout.tsx",
            attributes: [{ name: "suppressHydrationWarning", boolean: true }],
          },
        },
        // Wrap `{children}` with <ThemeProvider>.
        {
          id: "wrap-root-layout",
          args: {
            providerName: "ThemeProvider",
            providerImport: "@/components/theme-provider",
            importKind: "named",
          },
        },
        // IDE-only: pnpm's isolated linker + the package's subpath exports
        // are enough at runtime, but shadcn's CLI (when adding more
        // components) reads tsconfig.paths to know where ui/* lives.
        {
          id: "set-tsconfig-paths",
          args: {
            paths: { "{{package.name}}/*": ["../../packages/ui/src/*"] },
          },
        },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      // TSS has no next/font; pull Inter via @fontsource so the shadcn
      // `--font-sans` token resolves to a real font.
      dependencies: { "@fontsource-variable/inter": "^5.2.8" },
      devDependencies: { "@tailwindcss/vite": "^4.1.18" },
      templates: [
        // packages/ui/ — shared shadcn surface.
        {
          src: "shared/package/src/lib/utils.ts",
          dest: "src/lib/utils.ts",
          scope: "package",
        },
        {
          src: "shared/package/src/components/button.tsx",
          dest: "src/components/button.tsx",
          scope: "package",
          template: true,
        },
        {
          src: "shared/package/components.json",
          dest: "components.json",
          scope: "package",
          template: true,
        },
        // Start-specific globals.css — adds the @fontsource Inter import.
        {
          src: "tanstack-start/package/src/styles/globals.css",
          dest: "src/styles/globals.css",
          scope: "package",
        },
        // apps/<id>/ — outer shadcn config + the TSS-native ThemeProvider
        // (ScriptOnce-based, per https://ui.shadcn.com/docs/dark-mode/tanstack-start —
        // next-themes is Next-only).
        {
          src: "tanstack-start/app/components.json",
          dest: "components.json",
          scope: "app",
          template: true,
        },
        {
          src: "tanstack-start/app/components/theme-provider.tsx",
          dest: "components/theme-provider.tsx",
          scope: "app",
        },
      ],
      codemods: [
        // Splice tailwindcss() into the framework's vite.config.ts plugin array.
        {
          id: "add-plugin-to-call",
          args: {
            file: "vite.config.ts",
            callee: "defineConfig",
            property: "plugins",
            call: "tailwindcss()",
            imports: [{ from: "@tailwindcss/vite", default: "tailwindcss" }],
            position: "before:react",
          },
        },
        // TSS's idiomatic CSS wiring: import the stylesheet `?url` and
        // emit it as a `<link rel="stylesheet">` via the route's
        // `head: () => ({ links: [...] })`. The codemod creates the head
        // arrow + links array when absent.
        {
          id: "add-array-entry-in-call",
          args: {
            file: "src/routes/__root.tsx",
            callee: "createRootRoute",
            property: "head().links",
            entry: '{ rel: "stylesheet", href: appCss }',
            imports: [{ from: "{{package.name}}/globals.css?url", default: "appCss" }],
          },
        },
        // Hand-rolled ThemeProvider toggles `dark`/`light` on <html>;
        // suppressHydrationWarning silences the SSR/CSR class mismatch.
        {
          id: "set-html-attributes",
          args: {
            file: "src/routes/__root.tsx",
            attributes: [{ name: "suppressHydrationWarning", boolean: true }],
          },
        },
        // Wrap <Outlet /> with <ThemeProvider>. ThemeProvider defaults
        // (defaultTheme="system", storageKey="theme") match shadcn's
        // dark-mode-docs guidance, so no extra prop wiring is needed.
        {
          id: "wrap-root-layout",
          args: {
            providerName: "ThemeProvider",
            providerImport: "@/components/theme-provider",
            importKind: "named",
          },
        },
        // IDE-only: matches shadcn's app tsconfig paths so its CLI can add
        // more components without manual path config.
        {
          id: "set-tsconfig-paths",
          args: {
            paths: { "{{package.name}}/*": ["../../packages/ui/src/*"] },
          },
        },
      ],
    },
  ],
});
