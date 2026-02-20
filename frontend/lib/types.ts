export type KpiTile = {
  label: string;
  value: string;
  delta: string;
};

export type ProblemCluster = {
  id: string;
  name: string;
  summary: string;
  avg_urgency: number;
  post_count: number;
  trend_7d: number;
  trend_30d: number;
  created_at: string;
  updated_at: string;
};

export type PostRecord = {
  id: string;
  platform: string;
  title: string;
  content: string;
  upvotes: number;
  comments: number;
  url: string;
  created_at: string;
};

export type PainSignal = {
  id: string;
  post_id: string;
  pain_point: string;
  target_user: string;
  urgency_score: number;
  willingness_to_pay: number;
  existing_solutions: string[];
  geo_scope: string;
  industry: string;
  created_at: string;
};

export type Idea = {
  id: string;
  cluster_id: string;
  idea_type: "saas" | "automation" | "enterprise" | string;
  idea_name: string;
  description: string;
  icp: string;
  revenue_model: string;
  mvp_features: string[];
  pricing_estimate: string;
  pain_intensity: number;
  frequency: number;
  budget_size: number;
  competition_level: number;
  speed_to_mvp: number;
  scalability: number;
  final_score: number;
  execution_roadmap: string;
  tech_stack: string;
  gtm_strategy: string;
  launch_plan_30d: string;
  created_at: string;
};

export type TrendSignal = {
  cluster_id: string;
  cluster_name: string;
  trend_7d: number;
  trend_30d: number;
};

export type RevenueSummary = {
  revenue_model: string;
  idea_count: number;
};

export type DashboardOverview = {
  kpis: KpiTile[];
  top_clusters: ProblemCluster[];
  trending_signals: TrendSignal[];
  top_ideas: Idea[];
  revenue_summary: RevenueSummary[];
  quick_launch_plan: {
    title: string;
    bullet_points: string[];
  };
};

export type ClusterDetail = {
  cluster: ProblemCluster;
  pains: PainSignal[];
  ideas: Idea[];
  posts: PostRecord[];
};

export type AdminFilters = {
  id: number;
  include_keywords: string[];
  exclude_keywords: string[];
  geo_scope: "GLOBAL" | "INDIA";
  industries: string[];
  updated_at: string | null;
};
