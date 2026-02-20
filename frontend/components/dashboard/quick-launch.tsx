import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QuickLaunchCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {bullets.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
