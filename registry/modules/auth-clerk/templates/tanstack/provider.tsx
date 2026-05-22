import { ClerkProvider } from "@clerk/tanstack-react-start";
import type { ReactNode } from "react";

export function ClerkRootProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
