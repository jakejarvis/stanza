import { createAuthClient } from "better-auth/react";

// Defaults to the current origin. For cross-origin auth (e.g. a separate
// API host), pass `baseURL: "https://your-domain.com"` here.
// https://better-auth.com/docs/concepts/client
export const authClient = createAuthClient();
