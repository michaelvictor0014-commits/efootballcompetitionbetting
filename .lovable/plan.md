# Finish All — MVP Plan (single pass)

Two tracks, minimal viable in one shipment.

## Track A — Championship Virtual (bracket engine + 4 markets)

### Data (one migration)

- Extend `tournaments`:
  - `next_stage_at timestamptz` — when the current stage's matches resolve.
  - `bracket JSONB` — seed order + per-match state (`{ round, slot, home, away, home_score, away_score, winner, resolved_at }`).
  - `champion_team_id`, `runner_up_team_id`.
- Reuse `tournament_matches` (already 19 cols) for per-match rows written by the engine.
- Extend `markets` with kind values (existing enum-free `code TEXT`):
  - `championship_outright` (per-tournament, one selection per team)
  - `championship_reach_final`, `championship_reach_semi`, `championship_reach_quarter`
  - `championship_eliminated_at` (per-team per-stage)
  - `championship_match_winner` (per bracket match)
- Extend `odds` link to `tournament_id` (nullable) and `tournament_match_id` (nullable) so championship selections settle without a `match_id`.
- Extend `bet_selections` with `tournament_id` / `stage` fields (nullable) for settlement joins.

### Engine (SQL SECURITY DEFINER RPCs)

- `championship_bracket_assign(tournament_id)` — admin-callable. Picks 16 teams (admin-selected or random from `teams`), writes seeded bracket JSON, generates `tournament_matches` for R16, and generates all outright + reach-stage + eliminated-at odds priced from a simple team-strength model.
- `championship_tick()` — public heartbeat. For each `live` championship whose `next_stage_at <= now()`:
  1. Simulate the current stage's matches (penalty-shootout style: 5 kicks each, seeded by team strength + RNG). Write results to `tournament_matches` + `bracket JSONB`.
  2. Settle `championship_match_winner` + `championship_eliminated_at` for that stage.
  3. If final: mark tournament `completed`, set `champion_team_id`, settle outright + reach-stage markets. Push winning tickets.
  4. Else: build next round `tournament_matches`, generate per-match-winner odds for that round, set `next_stage_at = now() + stage_gap_seconds`.
- `championship_start(tournament_id)` — flips `scheduled` → `live`, sets `current_stage='R16'`, `next_stage_at=now()+gap`, ensures bracket exists.
- Hook `virtual_tick.ts` route to also call `championship_tick` (single cron endpoint, both engines).

### Admin (ChampionshipAdminPanel)

- Add "Assign teams" (auto-fill random 16 from active teams; also manual reorder via drag list — MVP uses auto-fill button + editable text list).
- "Start now" button (calls `championship_start`).
- Live bracket preview inside the panel.

### Player UI (`/virtual/championship`)

- Replace "coming next build" copy with a bracket board (4-column layout: R16 / QF / SF / F) rendering from `tournaments.bracket` JSON in realtime (supabase channel on `tournaments` + `tournament_matches`).
- Bet slip integration: 4 tabs — **Champion**, **Reach stage**, **Eliminated at**, **Per-match**. Selecting an odds row adds to the existing `BetSlipContext`.
- Live-stage banner with countdown to `next_stage_at`.

## Track B — Instant Virtual per-user round (MVP)

Existing engine runs a shared global cycle. MVP: give each signed-in user a **private start-my-round** overlay on top of that engine without rewriting the global cycle.

- Add `user_virtual_rounds` table: `{ id, user_id, match_id, side, kick_seed, started_at, result, payout, settled_at }`.
- New RPC `start_user_virtual_round(match_id, side, stake)`:
  - Debits stake via existing `place_real_ticket` path (or dedicated debit).
  - Generates deterministic 5-kick outcome server-side, stores in row.
- Client (`virtual.instant.tsx`): keep existing shared arena, but add a **"Start my private round"** button that opens a modal with side pick + stake, calls the RPC, then animates the 5 kicks from the server-provided outcome. Credit payout via RPC on last kick.
- Admin close-toggle: reuse `virtual_instant_enabled` (already present) — no new UI needed.

Explicitly out of scope for this pass: private per-user rounds that also mint their own odds / markets. MVP is fixed 1.9x win / 0 loss, single-match private shootout.

## File touches (approx)

- Migrations: `20260714_*_championship_engine.sql`, `20260714_*_user_virtual_rounds.sql`
- Edited: `src/routes/api/public/virtual-tick.ts`, `src/routes/virtual.championship.tsx`, `src/routes/virtual.instant.tsx`, `src/components/admin/ChampionshipAdminPanel.tsx`, `src/integrations/supabase/types.ts`
- Created: `src/components/BracketBoard.tsx`, `src/components/ChampionshipBetPanel.tsx`, `src/components/UserVirtualRoundDialog.tsx`

## Verification

- Migrations apply cleanly with GRANTs on new public tables.
- `championship_tick` idempotent (multiple calls between stages are no-ops).
- Manual smoke: schedule a tournament 30s out with 5s gap, watch bracket auto-advance through 4 stages, verify a placed outright bet settles at final.
- Instant Virtual private round: place, watch 5 kicks, balance updates once.

## Risks / trade-offs

- Bracket UI is functional, not cinematic — inter-stage 20s "reveal" is a countdown + fade-in of the next round's cards, not the full animated reveal in the earlier plan.
- Odds pricing for championship markets is a simple strength model; no admin price editor yet.
- Instant Virtual per-user is layered on the existing shared engine; a full rework where every user has their own arena instance is deferred.

Confirm and I'll ship this in one batch.
