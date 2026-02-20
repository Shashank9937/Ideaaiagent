"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getClusterById } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { ClusterDetail } from "@/lib/types";

export default function ClusterDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClusterDetail | null>(null);
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
        const detail = await getClusterById(params.id, session.access_token);
        setData(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load cluster");
      }
    };

    if (params.id) {
      load();
    }
  }, [params.id, router]);

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  if (!data) {
    return <p className="text-muted-foreground">Loading cluster intelligence...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{data.cluster.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Signals: {data.cluster.post_count}</Badge>
            <Badge variant="success">Avg urgency: {data.cluster.avg_urgency.toFixed(1)}</Badge>
            <Badge variant="outline">7d trend: {data.cluster.trend_7d}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data.cluster.summary}</p>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pain Summaries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.pains.map((pain) => (
              <div key={pain.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{pain.pain_point}</p>
                <p className="mt-1 text-xs text-muted-foreground">Target user: {pain.target_user}</p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">Urgency: {pain.urgency_score}/10</p>
                  <Progress value={pain.urgency_score * 10} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generated Ideas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.ideas.map((idea) => (
              <div key={idea.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{idea.idea_name}</p>
                  <Badge variant="outline" className="capitalize">
                    {idea.idea_type}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{idea.description}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Score: {idea.final_score.toFixed(1)}</span>
                  <Link href={`/ideas/${idea.id}`} className="text-primary underline-offset-4 hover:underline">
                    Open idea
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Related Source Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="capitalize">{post.platform}</TableCell>
                  <TableCell className="max-w-[480px] truncate">{post.title}</TableCell>
                  <TableCell>
                    {post.upvotes} upvotes · {post.comments} comments
                  </TableCell>
                  <TableCell>
                    <a href={post.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                      View
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
