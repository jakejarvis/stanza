import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "{{package.name}}";

export const { GET, POST } = toNextJsHandler(auth);
