import { Outlet, createRootRoute } from "@tanstack/react-router";

import "../globals.css";

export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <body>
        <Outlet />
      </body>
    </html>
  ),
});
