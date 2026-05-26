import { createFileRoute } from "@tanstack/react-router";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";

import { adapter } from "{{package.name}}";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        const stream = chat({ adapter, messages });

        return toServerSentEventsResponse(stream);
      },
    },
  },
});
