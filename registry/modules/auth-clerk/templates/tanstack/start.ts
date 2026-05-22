import { createStart } from "@tanstack/react-start";

import { clerkMiddleware } from "{{package.name}}";

export const startInstance = createStart(() => ({
  requestMiddleware: [clerkMiddleware()],
}));
