import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/session";

export default async function ProtectedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return children;
}
