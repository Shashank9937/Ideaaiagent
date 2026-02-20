"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminPanel } from "@/components/dashboard/admin-panel";
import { ClusterCard } from "@/components/dashboard/cluster-card";
import { IdeaTable } from "@/components/dashboard/idea-table";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { QuickLaunchCard } from "@/components/dashboard/quick-launch";
import { RevenueSummaryCard } from "@/components/dashboard/revenue-summary";
import { TrendingSignals } from "@/components/dashboard/trending-signals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminFilters, getDashboardOverview } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { AdminFilters, DashboardOverview } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [filters, setFilters] = useState<AdminFilters | null>(null);
  const [token, setToken] = useState<string | undefined>();

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      setToken(session.access_token);

      try {
        const [overviewData, filterData] = await Promise.all([
          getDashboardOverview(session.access_token),
          getAdminFilters(session.access_token).catch(() => null),
        ]);
        setOverview(overviewData);
        setFilters(filterData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [router]);

  if (isLoading) {
    return <p className="py-20 text-center text-muted-foreground">Loading intelligence dashboard...</p>;
  }

  if (error || !overview) {
    return <p className="py-20 text-center text-sm text-rose-300">{error ?? "No dashboard data available"}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.kpis.map((kpi) => (
          <KpiTile key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.delta} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Problem Clusters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {overview.top_clusters.map((cluster) => (
                <ClusterCard key={cluster.id} cluster={cluster} />
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <TrendingSignals signals={overview.trending_signals} />
          <RevenueSummaryCard items={overview.revenue_summary} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Highest Validation Score Ideas</CardTitle>
          </CardHeader>
          <CardContent>
            <IdeaTable ideas={overview.top_ideas} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <QuickLaunchCard title={overview.quick_launch_plan.title} bullets={overview.quick_launch_plan.bullet_points} />
          <AdminPanel accessToken={token} initialFilters={filters} />
        </div>
      </section>
    </div>
  );
}
