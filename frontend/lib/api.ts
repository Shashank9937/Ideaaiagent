import type { AdminFilters, ClusterDetail, DashboardOverview, Idea, ProblemCluster } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function apiRequest<T>(path: string, accessToken?: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export function getDashboardOverview(accessToken?: string) {
  return apiRequest<DashboardOverview>("/dashboard/overview", accessToken);
}

export function getClusters(accessToken?: string) {
  return apiRequest<ProblemCluster[]>("/clusters", accessToken);
}

export function getClusterById(clusterId: string, accessToken?: string) {
  return apiRequest<ClusterDetail>(`/clusters/${clusterId}`, accessToken);
}

export function getIdeas(accessToken?: string) {
  return apiRequest<Idea[]>("/ideas", accessToken);
}

export function getIdeaById(ideaId: string, accessToken?: string) {
  return apiRequest<Idea>(`/ideas/${ideaId}`, accessToken);
}

export function getAdminFilters(accessToken?: string) {
  return apiRequest<AdminFilters>("/admin/filters", accessToken);
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
