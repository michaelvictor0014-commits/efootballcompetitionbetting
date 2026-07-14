import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Loader2, CircleDot, Ticket, Radio, History, ChevronLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TeamLogo } from "@/components/TeamLogo";

// Per-user instant football shootout. Draws two random football-tagged teams,
// user picks a side + stake, and hitting "Place bet & shoot" starts the
// private shootout for that user only — no global countdown, no shared round.

type FbTeam = { id: string; name: string; logo_url: string | null };
type KickResult = { home_kicks: boolean[]; away_kicks: boolean[]; home_score: number; away_score: number; result: "won"|"lost"; payout: number; bet_id?: string; tracking_id?: string };

export const Route = createFileRoute("/virtual/football-instant")({
  head: () => ({
    meta: [
      { title: "Instant E-Football — Per-User Shootouts" },
      { name: "description", content: "One-tap virtual football shootouts. Bet, shoot, settle — all private to you." },
    ],
  }),
  component: FootballInstantPage,
  errorComponent: ({ error }) => <Layout><div className="container py-12 text-center text-destructive">{error.message}</div></Layout>,
  notFoundComponent: () => <Layout><div className="container py-12 text-center text-muted-foreground">Not found.</div></Layout>,
});

function FootballInstantPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [teams, setTeams] = useState<FbTeam[]>([]);
  const [pair, setPair] = useState<[FbTeam, FbTeam] | null>(null);
  const [side, setSide] = useState<"home"|"away">("home");
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KickResult | null>(null);
  const [kickIdx, setKickIdx] = useState(-1);
  const [recent, setRecent] = useState<Array<{ home: string; away: string; hs: number; as: number }>>([]);

  useEffect(() => {
    (async () => {
      const sb = supabase as any;
      const [{ data: s }, { data: t }, { data: hist }] = await Promise.all([
        sb.from("app_settings").select("virtual_football_instant_enabled").eq("id",1).maybeSingle(),
        sb.from("teams").select("id,name,logo_url").eq("sport","football").order("name"),
        sb.from("user_virtual_rounds").select("home_name,away_name,home_score,away_score").order("created_at",{ ascending: false }).limit(6),
      ]);
      setEnabled(!!s?.virtual_football_instant_enabled);
      setTeams((t ?? []) as FbTeam[]);
      setRecent(((hist ?? []) as any[]).map(r => ({ home: r.home_name, away: r.away_name, hs: r.home_score ?? 0, as: r.away_score ?? 0 })));
    })();
  }, []);

  useEffect(() => {
    if (teams.length >= 2 && !pair) drawPair();
  }, [teams, pair]);

  function drawPair() {
    if (teams.length < 2) return;
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    setPair([shuffled[0], shuffled[1]]);
    setResult(null); setKickIdx(-1);
  }

  async function placeBet() {
    if (!user) return toast.error("Sign in to play");
    if (!pair) return;
    if (stake <= 0) return toast.error("Stake must be positive");
    setBusy(true); setResult(null); setKickIdx(-1);
    const { data, error } = await (supabase as any).rpc("start_user_virtual_round", {
      p_home: pair[0].name, p_away: pair[1].name, p_side: side, p_stake: stake,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data as KickResult;
    setResult(r);
    let i = 0;
    const total = Math.max(r.home_kicks.length, r.away_kicks.length);
    const timer = setInterval(() => {
      setKickIdx(i); i++;
      if (i >= total) {
        clearInterval(timer);
        setTimeout(() => {
          if (r.result === "won") toast.success(`Won ${r.payout.toLocaleString()} ECB`);
          else toast.error("Better luck next round");
        }, 400);
      }
    }, 700);
  }

  return (
    <Layout>
      <div className="virtual-page min-h-[calc(100vh-4rem)]">
        <div className="container py-4 sm:py-6 space-y-4 max-w-3xl">
          <Card className="virtual-panel px-4 py-3">
            <div className="flex items-center justify-between">
              <Link to="/virtual" className="text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <div className="text-center">
                <div className="text-sm sm:text-base font-black tracking-wide gradient-gold-text">Instant E-Football</div>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground font-mono">Penalty shoot-out · 1.90x</span>
                  <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-300 uppercase tracking-widest text-[9px] font-black">
                    <Trophy className="h-3 w-3 mr-1"/> LIVE
                  </Badge>
                </div>
              </div>
              <Link to="/virtual/history" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[10px] uppercase tracking-widest">
                <History className="h-3.5 w-3.5" /> Rounds
              </Link>
            </div>
          </Card>

          <Card className="virtual-panel px-3 py-2 flex items-center gap-2 text-[11px]">
            <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span className="font-black uppercase tracking-widest text-emerald-300">Play as you stake</span>
            <span className="text-muted-foreground">— your shoot-out kicks off the moment your bet lands. No countdown.</span>
          </Card>

          {!enabled ? (
            <Card className="virtual-panel p-10 text-center text-muted-foreground">Instant E-Football is currently closed.</Card>
          ) : teams.length < 2 ? (
            <Card className="virtual-panel p-10 text-center text-muted-foreground">
              Not enough football-tagged teams yet. Admins can tag teams as football from Clans admin.
            </Card>
          ) : !pair ? (
            <Card className="virtual-panel p-10 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin"/></Card>
          ) : (
            <>
            {/* Featured teams strip */}
            <Card className="virtual-panel px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_#ff4d4d]" />
                  <TeamLogo name={pair[0].name} url={pair[0].logo_url} size={24} rounded="full" />
                  <span className="text-xs font-black truncate">{pair[0].name}</span>
                </div>
                <div className="font-mono font-black text-lg tabular-nums text-primary shrink-0">
                  {result ? `${result.home_score}:${result.away_score}` : "—"}
                </div>
                <div className="flex items-center gap-2 min-w-0 flex-row-reverse text-right">
                  <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_#4dd2ff]" />
                  <TeamLogo name={pair[1].name} url={pair[1].logo_url} size={24} rounded="full" />
                  <span className="text-xs font-black truncate">{pair[1].name}</span>
                </div>
              </div>
            </Card>

            {/* Pitch arena */}
            <Card className="virtual-panel virtual-arena p-4">
              <FootballPitch scoreA={result?.home_score ?? 0} scoreB={result?.away_score ?? 0} nameA={pair[0].name} nameB={pair[1].name} live={!!result} />
            </Card>

            {/* Pick side + stake */}
            <Card className="virtual-panel p-4 space-y-4">
              <div className="grid grid-cols-3 items-center gap-2">
                <button onClick={() => setSide("home")} disabled={!!result} className={`p-3 rounded-lg border transition ${side==="home"?"border-primary bg-primary/10":"border-border"} disabled:opacity-60`}>
                  <TeamLogo name={pair[0].name} url={pair[0].logo_url} size={48} rounded="full" />
                  <div className="font-bold text-sm mt-1 truncate">{pair[0].name}</div>
                  <div className="text-[10px] text-muted-foreground">Home · 1.90x</div>
                </button>
                <div className="text-center font-black text-2xl gradient-gold-text">
                  {result ? `${result.home_score} : ${result.away_score}` : "VS"}
                </div>
                <button onClick={() => setSide("away")} disabled={!!result} className={`p-3 rounded-lg border transition ${side==="away"?"border-primary bg-primary/10":"border-border"} disabled:opacity-60`}>
                  <TeamLogo name={pair[1].name} url={pair[1].logo_url} size={48} rounded="full" />
                  <div className="font-bold text-sm mt-1 truncate">{pair[1].name}</div>
                  <div className="text-[10px] text-muted-foreground">Away · 1.90x</div>
                </button>
              </div>

              {result && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">{pair[0].name}</div>
                    <div className="flex gap-1">{result.home_kicks.map((k,i) => (
                      <span key={i} className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold ${i>kickIdx?"bg-muted/30 text-muted-foreground":k?"bg-emerald-500/30 text-emerald-300":"bg-red-500/30 text-red-300"}`}>{i>kickIdx?"·":k?"✓":"✗"}</span>
                    ))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">{pair[1].name}</div>
                    <div className="flex gap-1">{result.away_kicks.map((k,i) => (
                      <span key={i} className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold ${i>kickIdx?"bg-muted/30 text-muted-foreground":k?"bg-emerald-500/30 text-emerald-300":"bg-red-500/30 text-red-300"}`}>{i>kickIdx?"·":k?"✓":"✗"}</span>
                    ))}</div>
                  </div>
                </div>
              )}

              {!result && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Stake (ECB)</Label>
                    <Input type="number" value={stake} min={1} onChange={(e) => setStake(Number(e.target.value)||0)} />
                  </div>
                  <div className="flex items-end">
                    <Button className="btn-luxury w-full" onClick={placeBet} disabled={busy || !user}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <CircleDot className="h-4 w-4 mr-1"/>}
                      Place bet & kick off
                    </Button>
                  </div>
                </div>
              )}

              {result && kickIdx >= 0 && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1 text-xs">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-300 font-black">Live commentary</div>
                  {(() => {
                    const lines: string[] = [];
                    const shown = Math.min(kickIdx + 1, Math.max(result.home_kicks.length, result.away_kicks.length));
                    for (let i = 0; i < shown; i++) {
                      const h = result.home_kicks[i];
                      const a = result.away_kicks[i];
                      if (h !== undefined) lines.push(`Penalty ${i + 1} · ${pair[0].name}: ${h ? "GOAL! Top corner, keeper had no chance." : "Saved! The keeper flies to his left."}`);
                      if (a !== undefined) lines.push(`Penalty ${i + 1} · ${pair[1].name}: ${a ? "Buries it — 1-0 on this kick." : "Off the post! Woodwork denies them."}`);
                    }
                    return lines.map((l, i) => <div key={i} className="text-muted-foreground">· {l}</div>);
                  })()}
                </div>
              )}

              {result?.bet_id && (
                <Link to="/ticket/$id" params={{ id: result.bet_id }}>
                  <Button variant="outline" className="w-full gap-2"><Ticket className="h-4 w-4"/>View bet voucher {result.tracking_id ? `· ${result.tracking_id}` : ""}</Button>
                </Link>
              )}

              <div className="flex justify-center pt-2">
                <Button variant="ghost" size="sm" onClick={drawPair}>Draw new matchup</Button>
              </div>
            </Card>

            {/* Previous scores */}
            <Card className="virtual-panel p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80 mb-2">
                Previous scores
              </div>
              <div className="space-y-1.5">
                {recent.length === 0 && <div className="text-[11px] text-muted-foreground">No history yet.</div>}
                {recent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="min-w-0 leading-tight">
                      <div className="truncate">{r.home}</div>
                      <div className="truncate text-muted-foreground">{r.away}</div>
                    </div>
                    <div className="font-mono font-black text-primary tabular-nums shrink-0">{r.hs}:{r.as}</div>
                  </div>
                ))}
              </div>
            </Card>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function FootballPitch({ scoreA, scoreB, nameA, nameB, live }: { scoreA: number; scoreB: number; nameA: string; nameB: string; live: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => (t + 1) % 240), 120);
    return () => clearInterval(iv);
  }, []);
  const bx = 20 + ((tick * 4) % 260);
  const by = 30 + Math.abs(Math.sin(tick * 0.15)) * 40;
  return (
    <div className="relative w-full rounded-md overflow-hidden border border-emerald-500/30" style={{ aspectRatio: "3 / 1.4" }}>
      <svg viewBox="0 0 300 140" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fp" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#052e16" />
            <stop offset="1" stopColor="#022c22" />
          </linearGradient>
          <pattern id="fpstripes" width="20" height="140" patternUnits="userSpaceOnUse">
            <rect width="10" height="140" fill="rgba(16,185,129,0.08)" />
          </pattern>
        </defs>
        <rect width="300" height="140" fill="url(#fp)" />
        <rect width="300" height="140" fill="url(#fpstripes)" />
        <line x1="150" y1="0" x2="150" y2="140" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        <circle cx="150" cy="70" r="18" fill="none" stroke="rgba(255,255,255,0.35)" />
        <rect x="0" y="50" width="8" height="40" fill="none" stroke="rgba(255,255,255,0.45)" />
        <rect x="292" y="50" width="8" height="40" fill="none" stroke="rgba(255,255,255,0.45)" />
        <rect x="0" y="30" width="46" height="80" fill="none" stroke="rgba(255,255,255,0.25)" />
        <rect x="254" y="30" width="46" height="80" fill="none" stroke="rgba(255,255,255,0.25)" />
        <circle cx={bx} cy={by} r="4" fill="#fef3c7" stroke="#0f172a" strokeWidth="0.6" />
        {[30, 80, 130, 190].map((x, i) => (
          <circle key={`h${i}`} cx={x} cy={40 + ((i * 27) % 60)} r="3" fill="#ef4444" />
        ))}
        {[120, 170, 220, 270].map((x, i) => (
          <circle key={`a${i}`} cx={x} cy={40 + ((i * 31) % 60)} r="3" fill="#38bdf8" />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-black">
        <span className="truncate max-w-[35%] text-red-200 drop-shadow">{nameA}</span>
        <span className="text-amber-300 tabular-nums text-lg drop-shadow">{scoreA} – {scoreB}</span>
        <span className="truncate max-w-[35%] text-sky-200 text-right drop-shadow">{nameB}</span>
      </div>
      {live && <div className="absolute top-1 left-1 text-[9px] uppercase tracking-widest bg-emerald-500/40 text-emerald-100 px-1.5 rounded">⚽ LIVE</div>}
    </div>
  );
}