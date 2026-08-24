import type { ReactNode } from "react";
import { AnticipationPanel } from "./anticipation-panel";

export default function NowLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AnticipationPanel />
      {children}
    </>
  );
}
