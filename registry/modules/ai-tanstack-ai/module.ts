import { defineModule } from "@withstanza/schema";

export default defineModule({
  id: "tanstack-ai",
  category: "ai",
  label: "TanStack AI",
  description: "Composable AI primitives across providers.",
  version: "0.1.0",
  peers: {
    framework: ["next", "tanstack-start"],
  },
  homepage: "https://tanstack.com/ai",
  dependencies: {
    "@tanstack/ai": "^0.22.0",
    "@tanstack/ai-openai": "^0.10.2",
  },
  env: [
    {
      name: "OPENAI_API_KEY",
      example: "sk-...",
      required: true,
      description: "OpenAI API key for the chat completion adapter.",
    },
  ],
  adapters: [
    {
      key: "next",
      match: { framework: "next" },
      templates: [
        { src: "shared/index.ts", dest: "src/index.ts", scope: "package" },
        { src: "shared/adapter.ts", dest: "src/adapter.ts", scope: "package" },
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
        { src: "shared/adapter.ts", dest: "src/adapter.ts", scope: "package" },
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
