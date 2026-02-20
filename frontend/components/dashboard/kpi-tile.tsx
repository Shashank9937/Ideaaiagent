import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function KpiTile({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <Card className="animate-fade-up shadow-glow">
      <CardHeader className="pb-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
        <p className="text-xs text-muted-foreground">{delta}</p>
      </CardContent>
    </Card>
  );
}
