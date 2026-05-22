import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function ClerkRootProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
