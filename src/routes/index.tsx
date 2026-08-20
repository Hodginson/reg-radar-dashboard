import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Users, TrendingUp, Clock } from "lucide-react";

import { listEvents, getEventDashboard } from "@/lib/eventsair.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EventsAir Registration Dashboard" },
      {
        name: "description",
        content:
          "Live registration counts, daily trends and registration-type breakdowns for your EventsAir event.",
      },
      { property: "og:title", content: "EventsAir Registration Dashboard" },
      {
        property: "og:description",
        content: "Live registration counts and daily trends for your EventsAir event.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="flex items-center gap-4 pt-6">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const [eventId, setEventId] = useState<string | undefined>(undefined);

  const eventsQuery = useQuery({
    queryKey: ["eventsair", "events"],
    queryFn: () => listEvents(),
  });

  const events = eventsQuery.data?.events ?? [];
  const selectedId = eventId ?? events[0]?.id;

  const dashboardQuery = useQuery({
    queryKey: ["eventsair", "dashboard", selectedId],
    queryFn: () => getEventDashboard({ data: { eventId: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  const data = dashboardQuery.data;
  const maxType = Math.max(1, ...(data?.byType.map((t) => t.count) ?? [1]));

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">EventsAir</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              Registration Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data?.event.name ?? "Select an event"}
              {data?.event.startDate ? ` · starts ${data.event.startDate}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.demo && <Badge variant="secondary">Demo data</Badge>}
            <Select value={selectedId ?? ""} onValueChange={setEventId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choose an event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {dashboardQuery.isPending && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        )}

        {dashboardQuery.isError && (
          <Card className="mt-8 border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">
              Couldn't load registrations: {(dashboardQuery.error as Error).message}
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total registrations" value={data.totalRegistrations} icon={Users} />
              <Stat label="Last 7 days" value={data.last7Days} icon={TrendingUp} />
              <Stat label="Today" value={data.registeredToday} icon={Clock} />
              <Stat label="Registration types" value={data.byType.length} icon={CalendarDays} />
            </section>

            <Card className="mt-6 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  Daily registrations · 90 days to {data.daily[data.daily.length - 1]?.date}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(5)}
                      tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "0.75rem",
                        color: "var(--color-foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Registrations"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      fill="url(#regFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="mt-6 grid gap-6 lg:grid-cols-1">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base font-medium">By registration type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.byType.map((t) => (
                    <div key={t.type}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-foreground">{t.type}</span>
                        <span className="tabular-nums text-muted-foreground">{t.count}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${(t.count / maxType) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
