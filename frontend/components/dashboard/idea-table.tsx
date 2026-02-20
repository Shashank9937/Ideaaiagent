import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Idea } from "@/lib/types";

export function IdeaTable({ ideas }: { ideas: Idea[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Idea</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>ICP</TableHead>
          <TableHead>Validation</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ideas.map((idea) => (
          <TableRow key={idea.id}>
            <TableCell>
              <p className="font-medium">{idea.idea_name}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{idea.revenue_model}</p>
            </TableCell>
            <TableCell className="capitalize">{idea.idea_type}</TableCell>
            <TableCell className="max-w-[220px] truncate">{idea.icp}</TableCell>
            <TableCell>
              <div className="space-y-1">
                <p className="text-xs">{idea.final_score.toFixed(1)} / 100</p>
                <Progress value={idea.final_score} />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <Link href={`/ideas/${idea.id}`} className="text-sm text-primary underline-offset-4 hover:underline">
                Open
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
