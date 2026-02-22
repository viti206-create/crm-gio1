import React from "react";
import CrmShell from "./CrmShell";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <CrmShell>{children}</CrmShell>;
}