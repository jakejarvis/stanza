import { createStart } from "@tanstack/react-start";

import { clerkMiddleware } from "{{packageName}}";

export const startInstance = createStart(() => ({
  requestMiddleware: [clerkMiddleware()],
}));
