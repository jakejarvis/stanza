import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { model } from "{{package.name}}";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
