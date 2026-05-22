import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // apps/web is intentionally omitted: its plugin-heavy SSR config trips a
    // vite-plus alpha bug in the workspace project loader (`runner.config` is
    // undefined during suite collection — same class as voidzero-dev/vite-plus#1076).
    // Re-add it here once that's fixed upstream; it passes when run on its own.
    projects: ["apps/*", "packages/*", "!apps/web"],
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    sortImports: {},
    sortTailwindcss: {
      stylesheet: "apps/web/src/styles.css",
      functions: ["clsx", "cn", "cva", "tw"],
      preserveDuplicates: false,
      preserveWhitespace: false,
    },
    sortPackageJson: true,
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "**/routeTree.gen.ts",
      "**/coverage/**",
      "apps/web/public/registry/**",
      "registry/modules/*/logo*.svg",
      "registry/modules/*/templates/**",
    ],
  },
  lint: {
    plugins: ["oxc", "eslint", "typescript", "unicorn", "import", "promise", "vitest"],
    categories: {
      correctness: "error",
      suspicious: "warn",
      perf: "warn",
    },
    rules: {
      "no-console": "off",
      "no-empty": [
        "error",
        {
          allowEmptyCatch: true,
        },
      ],
      "no-await-in-loop": "off",
      "unicorn/no-null": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-array-reduce": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "**/*.gen.ts",
      "**/coverage/**",
      "registry/modules/*/templates/**",
    ],
    overrides: [
      {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
          "typescript/no-explicit-any": "off",
          // Codemod apply/revert are typed `Promise<R> | R` so authors can write
          // async codemods, but the builtins under test are synchronous and the
          // suites call them for their side effects — no promise to await.
          "typescript/no-floating-promises": "off",
          // Test setup constructs mock objects/results and casts them into shape.
          "typescript/no-unsafe-type-assertion": "off",
        },
      },
      {
        files: ["apps/web/**/*.tsx"],
        plugins: [
          "oxc",
          "eslint",
          "typescript",
          "react",
          "react-perf",
          "promise",
          "jsx-a11y",
          "unicorn",
          "import",
          "vitest",
        ],
        rules: {
          "react/react-in-jsx-scope": "off",
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
});
