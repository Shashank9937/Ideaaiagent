"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function TopNav({ title }: { title: string }) {
  const router = useRouter();

  const onSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-border bg-accent/60 p-2">
            <Radar className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Market War Radar</p>
            <h1 className="text-sm font-semibold sm:text-base">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="inline-flex h-9 items-center rounded-md px-3 text-sm hover:bg-accent">
            Dashboard
          </Link>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
