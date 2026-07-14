import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { VirtualPage } from "./virtual.instant";

export const Route = createFileRoute("/virtual/football-instant")({
  head: () => ({
    meta: [
      { title: "Instant E-Football — ECB Virtual League" },
      { name: "description", content: "Live shared shoot-out rounds for e-football. Watch the live feed, line-ups, and previous scores." },
    ],
  }),
  component: () => <VirtualPage title="ECB Virtual E-Football League" />,
  errorComponent: ({ error }) => <Layout><div className="container py-12 text-center text-destructive">{error.message}</div></Layout>,
  notFoundComponent: () => <Layout><div className="container py-12 text-center text-muted-foreground">Not found.</div></Layout>,
});
