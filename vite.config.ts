import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["apps/*", "packages/*"],
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
      "**/.source/**",
      "**/routeTree.gen.ts",
      "**/coverage/**",
      "apps/web/public/registry/**",
      "apps/web/public/schema.json",
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
      "no-underscore-dangle": "off",
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
      "**/.source/**",
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
