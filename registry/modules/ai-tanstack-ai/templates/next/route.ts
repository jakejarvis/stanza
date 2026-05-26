import { chat, toServerSentEventsResponse } from "@tanstack/ai";

import { adapter } from "{{package.name}}";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({ adapter, messages });

  return toServerSentEventsResponse(stream);
}
