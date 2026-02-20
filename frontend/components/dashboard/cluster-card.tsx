import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProblemCluster } from "@/lib/types";

export function ClusterCard({ cluster }: { cluster: ProblemCluster }) {
  return (
    <Link href={`/clusters/${cluster.id}`}>
      <Card className="h-full transition duration-200 hover:border-primary/50 hover:bg-accent/20">
        <CardHeader className="space-y-2">
          <CardTitle className="line-clamp-2 text-lg">{cluster.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{cluster.post_count} signals</Badge>
            <Badge variant="success">Urgency {cluster.avg_urgency.toFixed(1)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-3 text-sm text-muted-foreground">{cluster.summary}</p>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span>7d: {cluster.trend_7d}</span>
            <span>30d: {cluster.trend_30d}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
