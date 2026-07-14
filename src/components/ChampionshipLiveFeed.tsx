import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Circle, Trophy, ArrowRight } from "lucide-react";

type LiveEvent = { at: number; minute: number; type: string; side?: "a" | "b"; text: string };
type Row = {
  id: string; round_name: string; slot: number;
  participant_a_id: string | null; participant_b_id: string | null;
  score_a: number | null; score_b: number | null;
  winner_id: string | null; status: string | null; updated_at: string | null;
  live_events: LiveEvent[] | null;
};
type Team = { id: string; name: string; logo_url: string | null };

const STAGE_LABEL: Record<string, string> = { R16: "Round of 16", QF: "Quarterfinal", SF: "Semifinal", F: "Final" };

/** Live commentary + score feed for a championship bracket. Streams live-stage
 * events per match, shows just-settled scores, and previews next-round line-up
 * during the between-stage gap. Football vs generic just flavours the copy. */
export function ChampionshipLiveFeed({ tournamentId, sport, currentStage }: { tournamentId: string; sport: "football" | "generic"; currentStage?: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase as any)
        .from("tournament_matches")
        .select("id,round_name,slot,participant_a_id,participant_b_id,score_a,score_b,winner_id,status,updated_at,live_events")
        .eq("tournament_id", tournamentId)
        .order("round", { ascending: false })
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      const rs = (data ?? []) as Row[];
      setRows(rs);
      const ids = Array.from(new Set(rs.flatMap((r) => [r.participant_a_id, r.participant_b_id]).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: ts } = await (supabase as any).from("teams").select("id,name,logo_url").in("id", ids);
        if (!cancelled) setTeams(Object.fromEntries((ts ?? []).map((t: Team) => [t.id, t])));
      }
    };
    load();
    const ch = (supabase as any)
      .channel(`champ-feed:${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    const iv = setInterval(load, 2500);
    return () => { cancelled = true; clearInterval(iv); try { (supabase as any).removeChannel(ch); } catch { /* noop */ } };
  }, [tournamentId]);

  const nameOf = (id: string | null) => (id ? teams[id]?.name ?? "?" : "?");
  const live = rows.filter((r) => r.status === "live");
  const pendingNext = currentStage ? rows.filter((r) => r.status === "pending" && r.round_name === currentStage) : [];
  const completed = rows.filter((r) => r.status === "completed").slice(0, 16);

  if (live.length === 0 && completed.length === 0 && pendingNext.length === 0) {
    return (
      <div className="rounded-lg border border-primary/20 bg-background/40 p-4 text-center text-xs text-muted-foreground">
        <Radio className="h-4 w-4 mx-auto mb-1 opacity-40" />
        Live feed will appear here as soon as the first stage kicks off.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-background/40 p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-primary font-black">
        <Radio className="h-3 w-3 animate-pulse text-destructive" />
        Live feed{sport === "football" ? " · Football" : ""}
      </div>

      {live.length > 0 && (
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-destructive font-black flex items-center gap-1">
            <Circle className="h-2 w-2 fill-destructive text-destructive animate-pulse" /> Live now — {STAGE_LABEL[live[0].round_name] ?? live[0].round_name}
          </div>
          <div className="grid gap-2">
            {live.map((r) => {
              const ev = (r.live_events ?? []).slice(-3).reverse();
              return (
                <div key={r.id} className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold truncate flex-1">{nameOf(r.participant_a_id)}</span>
                    <span className="tabular-nums font-black text-amber-300 text-base">{r.score_a ?? 0} – {r.score_b ?? 0}</span>
                    <span className="font-bold truncate flex-1 text-right">{nameOf(r.participant_b_id)}</span>
                  </div>
                  {ev.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-muted-foreground">
                      {ev.map((e, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="tabular-nums text-primary/70 shrink-0">{e.minute}'</span>
                          <span className={e.type === "goal" ? "text-emerald-300 font-bold" : ""}>{e.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {live.length === 0 && pendingNext.length > 0 && (
        <section className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-amber-300 font-black flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Next up — {STAGE_LABEL[pendingNext[0].round_name] ?? pendingNext[0].round_name} line-up
          </div>
          <div className="grid gap-1 text-xs">
            {pendingNext.map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-b border-border/40 pb-1 last:border-0">
                <span className="font-bold truncate flex-1">{nameOf(r.participant_a_id)}</span>
                <span className="text-[10px] text-muted-foreground">vs</span>
                <span className="font-bold truncate flex-1 text-right">{nameOf(r.participant_b_id)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-black flex items-center gap-1">
            <Trophy className="h-3 w-3" /> Results
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 text-xs">
            {completed.map((r) => {
              const a = nameOf(r.participant_a_id), b = nameOf(r.participant_b_id);
              const sa = r.score_a ?? 0, sb = r.score_b ?? 0;
              const winner = r.winner_id === r.participant_a_id ? a : b;
              const loser = r.winner_id === r.participant_a_id ? b : a;
              const stage = STAGE_LABEL[r.round_name] ?? r.round_name;
              const verb = sport === "football"
                ? (Math.abs(sa - sb) >= 3 ? "thrash" : Math.abs(sa - sb) === 1 ? "edge past" : "sink")
                : (Math.abs(sa - sb) >= 3 ? "dominate" : "outlast");
              return (
                <div key={r.id} className="flex items-baseline gap-2 border-b border-border/40 pb-1 last:border-0">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">{stage}</span>
                  <span className="font-bold">{winner}</span>
                  <span className="text-muted-foreground">{verb}</span>
                  <span className="font-bold">{loser}</span>
                  <span className="ml-auto tabular-nums font-black text-amber-300">{sa}–{sb}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
