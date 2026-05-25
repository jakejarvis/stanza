[shadcn/ui](https://ui.shadcn.com) components on top of [Radix UI](https://www.radix-ui.com) primitives — vendored into `{{packages.ui.name}}` so you own the source.

Import primitives from subpaths:

```ts
import { Button } from "{{packages.ui.name}}/components/button";
import { cn } from "{{packages.ui.name}}/lib/utils";
```

Theme tokens live in `{{packages.ui.name}}/src/styles/globals.css`. Dark mode toggles via `next-themes` (already wired into the root layout).
