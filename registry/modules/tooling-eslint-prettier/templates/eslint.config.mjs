import js from "@eslint/js";
import tseslint from "typescript-eslint";
{{#if (eq peers.framework "next")}}
import next from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
{{/if}}
{{#if (eq peers.framework "tanstack-start")}}
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
{{/if}}
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
{{#if (eq peers.framework "next")}}
      "**/.next/**",
      "**/next-env.d.ts",
{{/if}}
{{#if (eq peers.framework "tanstack-start")}}
      "**/.output/**",
      "**/.nitro/**",
      "**/routeTree.gen.ts",
{{/if}}
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
{{#if (eq peers.framework "next")}}
  {
    plugins: {
      "@next/next": next,
      "react-hooks": reactHooks,
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
{{/if}}
{{#if (eq peers.framework "tanstack-start")}}
  {
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },
{{/if}}
  prettier,
);
