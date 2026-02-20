"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAdminFilters, triggerScrape, triggerTrendRecalc } from "@/lib/api";
import type { AdminFilters } from "@/lib/types";

const INDUSTRY_OPTIONS = ["SaaS", "Energy", "B2B", "AI", "Logistics"];

export function AdminPanel({ accessToken, initialFilters }: { accessToken?: string; initialFilters: AdminFilters | null }) {
  const [includeKeywords, setIncludeKeywords] = useState((initialFilters?.include_keywords ?? []).join(", "));
  const [excludeKeywords, setExcludeKeywords] = useState((initialFilters?.exclude_keywords ?? []).join(", "));
  const [geoScope, setGeoScope] = useState<"GLOBAL" | "INDIA">(initialFilters?.geo_scope ?? "GLOBAL");
  const [industries, setIndustries] = useState<string[]>(initialFilters?.industries ?? ["SaaS"]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sanitizedPayload = useMemo(() => {
    const parse = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
    return {
      include_keywords: parse(includeKeywords),
      exclude_keywords: parse(excludeKeywords),
      geo_scope: geoScope,
      industries,
    };
  }, [excludeKeywords, geoScope, includeKeywords, industries]);

  const toggleIndustry = (industry: string) => {
    setIndustries((current) =>
      current.includes(industry) ? current.filter((item) => item !== industry) : [...current, industry],
    );
  };

  const onSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await updateAdminFilters(sanitizedPayload, accessToken);
      setMessage("Filters saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save filters");
    } finally {
      setIsSaving(false);
    }
  };

  const onRun = async (mode: "scrape" | "trends") => {
    setIsRunning(true);
    setMessage(null);
    try {
      if (mode === "scrape") {
        await triggerScrape(accessToken);
        setMessage("Scraping pipeline triggered");
      } else {
        await triggerTrendRecalc(accessToken);
        setMessage("Trend recalculation triggered");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="include">Include keywords</Label>
          <Input
            id="include"
            placeholder="churn, manual process, costly"
            value={includeKeywords}
            onChange={(event) => setIncludeKeywords(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exclude">Exclude keywords</Label>
          <Input
            id="exclude"
            placeholder="student, meme"
            value={excludeKeywords}
            onChange={(event) => setExcludeKeywords(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Geo scope</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={geoScope === "GLOBAL" ? "default" : "outline"}
              onClick={() => setGeoScope("GLOBAL")}
            >
              Global
            </Button>
            <Button
              type="button"
              variant={geoScope === "INDIA" ? "default" : "outline"}
              onClick={() => setGeoScope("INDIA")}
            >
              India
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Industries</p>
          <div className="flex flex-wrap gap-2">
            {INDUSTRY_OPTIONS.map((industry) => (
              <Button
                key={industry}
                type="button"
                size="sm"
                variant={industries.includes(industry) ? "secondary" : "outline"}
                onClick={() => toggleIndustry(industry)}
              >
                {industry}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save filters"}
          </Button>
          <Button variant="outline" onClick={() => onRun("scrape")} disabled={isRunning}>
            Trigger scraping run
          </Button>
          <Button variant="outline" onClick={() => onRun("trends")} disabled={isRunning}>
            Recalculate trends
          </Button>
        </div>

        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
