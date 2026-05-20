import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "{{packageName}}";

export const { GET, POST } = toNextJsHandler(auth);
