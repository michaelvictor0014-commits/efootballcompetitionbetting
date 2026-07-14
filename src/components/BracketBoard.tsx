import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export type BracketMatch = {
  id: string;
  round: number;
  round_name: string;
  slot: number;
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  winner_id: string | null;
  status: string | null;
};

export type TeamInfo = { id: string; name: string | null; logo_url: string | null };

const STAGES: { name: string; label: string; round: number }[] = [
  { name: "R16", label: "Round of 16", round: 1 },
  { name: "QF", label: "Quarterfinals", round: 2 },
  { name: "SF", label: "Semifinals", round: 3 },
  { name: "F", label: "Final", round: 4 },
];

export function BracketBoard({ tournamentId, currentStage }: { tournamentId: string; currentStage: string | null }) {
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [teams, setTeams] = useState<Record<string, TeamInfo>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: m } = await (supabase as any)
        .from("tournament_matches")
        .select("id,round,round_name,slot,participant_a_id,participant_b_id,score_a,score_b,winner_id,status")
        .eq("tournament_id", tournamentId)
        .order("round").order("slot");
      if (cancelled) return;
      const ms = (m ?? []) as BracketMatch[];
      setMatches(ms);
      const ids = Array.from(new Set(ms.flatMap((r) => [r.participant_a_id, r.participant_b_id]).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: ts } = await (supabase as any).from("teams").select("id,name,logo_url").in("id", ids);
        if (!cancelled) setTeams(Object.fromEntries((ts ?? []).map((t: TeamInfo) => [t.id, t])));
      }
    };
    load();
    const ch = (supabase as any)
      .channel(`bracket:${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    return () => { cancelled = true; (supabase as any).removeChannel(ch); };
  }, [tournamentId]);

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {STAGES.map((s) => {
        const rows = matches.filter((m) => m.round_name === s.name);
        const isCurrent = currentStage === s.name;
        return (
          <div key={s.name} className="space-y-2">
            <div className={`text-[10px] uppercase tracking-[0.3em] font-black text-center py-1.5 rounded-md ${isCurrent ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
              {s.label}
            </div>
            {rows.length === 0 ? (
              <div className="h-16 rounded-md border border-dashed border-border/40 grid place-items-center text-[10px] text-muted-foreground">TBD</div>
            ) : (
              rows.map((m) => <BracketCard key={m.id} m={m} teams={teams} isFinal={s.name === "F"} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

function BracketCard({ m, teams, isFinal }: { m: BracketMatch; teams: Record<string, TeamInfo>; isFinal: boolean }) {
  const a = m.participant_a_id ? teams[m.participant_a_id] : null;
  const b = m.participant_b_id ? teams[m.participant_b_id] : null;
  const done = m.status === "completed";
  return (
    <div className={`rounded-md border p-2 text-xs bg-card/40 backdrop-blur-sm ${done ? "border-primary/30" : "border-border/60"}`}>
      <Row team={a} score={m.score_a} isWinner={done && m.winner_id === m.participant_a_id} isFinal={isFinal} />
      <div className="h-px bg-border/50 my-1" />
      <Row team={b} score={m.score_b} isWinner={done && m.winner_id === m.participant_b_id} isFinal={isFinal} />
    </div>
  );
}

function Row({ team, score, isWinner, isFinal }: { team: TeamInfo | null; score: number | null; isWinner: boolean; isFinal: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${isWinner ? "text-primary font-black" : ""}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {isWinner && isFinal ? <Trophy className="h-3 w-3 shrink-0 text-amber-400" /> : null}
        <span className="truncate">{team?.name ?? "—"}</span>
      </div>
      <span className="tabular-nums opacity-80">{score ?? "-"}</span>
    </div>
  );
}