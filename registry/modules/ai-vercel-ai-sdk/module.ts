import { defineModule } from "@stanza/registry";

export default defineModule({
  id: "vercel-ai-sdk",
  category: "ai",
  label: "Vercel AI SDK",
  description: "Streaming AI SDK with tools, structured output, and React hooks.",
  version: "0.1.0",
  peers: {
    framework: ["next", "tanstack-start"],
  },
  homepage: "https://ai-sdk.dev",
  dependencies: {
    ai: "^6.0.191",
    "@ai-sdk/openai": "^3.0.65",
  },
  env: [
    {
      name: "OPENAI_API_KEY",
      example: "sk-...",
      required: true,
      description: "OpenAI API key for the chat completion provider.",
    },
  ],
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      templates: [
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        { src: "shared/model.ts", dest: "src/model.ts", scope: "package" },
        {
          src: "next/route.ts",
          dest: "app/api/chat/route.ts",
          scope: "app",
          template: true,
        },
      ],
    },
    {
      key: "tanstack-start",
      match: { framework: "tanstack-start" },
      templates: [
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        { src: "shared/model.ts", dest: "src/model.ts", scope: "package" },
        {
          src: "tanstack/route.ts",
          dest: "src/routes/api/chat.ts",
          scope: "app",
          template: true,
        },
      ],
    },
  ],
});
