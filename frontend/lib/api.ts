import type { AdminFilters, ClusterDetail, DashboardOverview, Idea, ProblemCluster } from "@/lib/types";

const API_BASE_CANDIDATES = [
  "/api/v1",
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV === "development" ? "http://localhost:8000/api/v1" : "https://ideaaiagent.onrender.com/api/v1",
].filter((value): value is string => Boolean(value));

const EMPTY_DASHBOARD: DashboardOverview = {
  kpis: [
    { label: "Posts Collected", value: "0", delta: "Live" },
    { label: "Pain Signals", value: "0", delta: "Analyzed" },
    { label: "Problem Clusters", value: "0", delta: "Grouped" },
    { label: "Avg Validation", value: "0.0", delta: "/100" },
  ],
  top_clusters: [],
  trending_signals: [],
  top_ideas: [],
  revenue_summary: [],
  quick_launch_plan: {
    title: "Data is loading",
    bullet_points: [
      "Backend is reachable but market data is not ready yet.",
      "Run a scrape from Admin Controls to populate insights.",
    ],
  },
};

const EMPTY_ADMIN_FILTERS: AdminFilters = {
  id: 1,
  include_keywords: [],
  exclude_keywords: [],
  geo_scope: "GLOBAL",
  industries: ["SaaS"],
  updated_at: null,
};

function isoNow() {
  return new Date().toISOString();
}

function emptyCluster(clusterId: string): ClusterDetail {
  return {
    cluster: {
      id: clusterId,
      name: "Cluster unavailable",
      summary: "Cluster data is temporarily unavailable.",
      avg_urgency: 0,
      post_count: 0,
      trend_7d: 0,
      trend_30d: 0,
      created_at: isoNow(),
      updated_at: isoNow(),
    },
    pains: [],
    ideas: [],
    posts: [],
  };
}

function emptyIdea(ideaId: string): Idea {
  return {
    id: ideaId,
    cluster_id: "00000000-0000-0000-0000-000000000000",
    idea_type: "saas",
    idea_name: "Idea unavailable",
    description: "Idea data is temporarily unavailable.",
    icp: "N/A",
    revenue_model: "N/A",
    mvp_features: [],
    pricing_estimate: "N/A",
    pain_intensity: 0,
    frequency: 0,
    budget_size: 0,
    competition_level: 0,
    speed_to_mvp: 0,
    scalability: 0,
    final_score: 0,
    execution_roadmap: "N/A",
    tech_stack: "N/A",
    gtm_strategy: "N/A",
    launch_plan_30d: "N/A",
    created_at: isoNow(),
  };
}

async function apiRequest<T>(path: string, accessToken?: string, init?: RequestInit): Promise<T> {
  const errors: string[] = [];

  for (const baseUrl of API_BASE_CANDIDATES) {
    try {
      const headers = new Headers(init?.headers);
      headers.set("Content-Type", "application/json");
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      const text = await res.text();
      errors.push(`${baseUrl}${path} -> ${res.status}${text ? `: ${text}` : ""}`);
    } catch (error) {
      errors.push(`${baseUrl}${path} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(" | "));
}

export function getDashboardOverview(accessToken?: string) {
  return apiRequest<DashboardOverview>("/dashboard/overview", accessToken).catch(() => EMPTY_DASHBOARD);
}

export function getClusters(accessToken?: string) {
  return apiRequest<ProblemCluster[]>("/clusters", accessToken).catch(() => []);
}

export function getClusterById(clusterId: string, accessToken?: string) {
  return apiRequest<ClusterDetail>(`/clusters/${clusterId}`, accessToken).catch(() => emptyCluster(clusterId));
}

export function getIdeas(accessToken?: string) {
  return apiRequest<Idea[]>("/ideas", accessToken).catch(() => []);
}

export function getIdeaById(ideaId: string, accessToken?: string) {
  return apiRequest<Idea>(`/ideas/${ideaId}`, accessToken).catch(() => emptyIdea(ideaId));
}

export function getAdminFilters(accessToken?: string) {
  return apiRequest<AdminFilters>("/admin/filters", accessToken).catch(() => EMPTY_ADMIN_FILTERS);
}

export function updateAdminFilters(payload: Omit<AdminFilters, "id" | "updated_at">, accessToken?: string) {
  return apiRequest<AdminFilters>("/admin/filters", accessToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function triggerScrape(accessToken?: string) {
  return apiRequest<{ status: string; result: Record<string, number> }>("/admin/run-scrape", accessToken, {
    method: "POST",
  });
}

export function triggerTrendRecalc(accessToken?: string) {
  return apiRequest<{ status: string }>("/admin/recalculate-trends", accessToken, {
    method: "POST",
  });
}
