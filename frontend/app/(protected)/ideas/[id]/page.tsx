"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getIdeaById } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { Idea } from "@/lib/types";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

export default function IdeaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      try {
        const item = await getIdeaById(params.id, session.access_token);
        setIdea(item);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load idea");
      }
    };

    if (params.id) {
      load();
    }
  }, [params.id, router]);

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  if (!idea) {
    return <p className="text-muted-foreground">Loading idea execution roadmap...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{idea.idea_name}</CardTitle>
            <Badge variant="success">Score {idea.final_score.toFixed(1)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{idea.description}</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ideal customer profile</p>
            <p className="text-sm">{idea.icp}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Revenue model</p>
            <p className="text-sm">{idea.revenue_model}</p>
            <p className="text-xs text-muted-foreground">Pricing estimate: {idea.pricing_estimate}</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Validation Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Metric label="Pain intensity" value={idea.pain_intensity} />
            <Metric label="Frequency" value={idea.frequency} />
            <Metric label="Budget size" value={idea.budget_size} />
            <Metric label="Competition level" value={idea.competition_level} />
            <Metric label="Speed to MVP" value={idea.speed_to_mvp} />
            <Metric label="Scalability" value={idea.scalability} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MVP Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {idea.mvp_features.map((feature) => (
                <li key={feature}>• {feature}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Execution Roadmap</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{idea.execution_roadmap}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suggested Tech Stack</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{idea.tech_stack}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Go-to-market Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{idea.gtm_strategy}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>30-Day Launch Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{idea.launch_plan_30d}</p>
          <div className="mt-4">
            <Link href={`/clusters/${idea.cluster_id}`} className="text-sm text-primary underline-offset-4 hover:underline">
              Back to related cluster
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
