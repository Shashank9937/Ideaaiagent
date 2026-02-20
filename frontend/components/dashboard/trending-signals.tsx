import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendSignal } from "@/lib/types";

export function TrendingSignals({ signals }: { signals: TrendSignal[] }) {
  const maxValue = Math.max(...signals.map((item) => item.trend_30d), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trending Pain Signals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {signals.length === 0 && <p className="text-sm text-muted-foreground">No trend data yet.</p>}
        {signals.map((signal) => (
          <div key={signal.cluster_id} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="line-clamp-1 pr-4">{signal.cluster_name}</span>
              <span className="text-muted-foreground">{signal.trend_7d} / {signal.trend_30d}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((signal.trend_30d / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
