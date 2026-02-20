import type { ReactNode } from "react";

import { TopNav } from "@/components/dashboard/top-nav";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopNav title="AI Founder Intelligence Engine" />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
