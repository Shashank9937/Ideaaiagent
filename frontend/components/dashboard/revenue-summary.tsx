import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevenueSummary } from "@/lib/types";

export function RevenueSummaryCard({ items }: { items: RevenueSummary[] }) {
  const total = items.reduce((acc, item) => acc + item.idea_count, 0) || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Model Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No idea data available.</p>}
        {items.map((item) => {
          const pct = Math.round((item.idea_count / total) * 100);
          return (
            <div key={item.revenue_model} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="line-clamp-1 pr-2">{item.revenue_model}</span>
                <span className="text-muted-foreground">{item.idea_count}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
