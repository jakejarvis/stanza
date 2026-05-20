import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

export function ClerkRootProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
