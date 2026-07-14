## Championship Flow Rework — Booking Window + Live Play-by-Play

### 1. Database (single migration)

**`app_settings` — new championship timing knobs**
- `championship_booking_seconds` (int, default 120) — pre-tournament selection window
- `championship_stage_gap_seconds` (int, default 20) — pause between stages (already exists per-tournament, promote to global default)
- `championship_stage_live_seconds` (int, default 30) — how long each stage's "live play" runs before results resolve

**`tournaments` — new columns**
- `booking_closes_at timestamptz` — when booking window ends
- `stage_live_seconds int` — inherited from settings at draw time
- `current_stage_live_ends_at timestamptz` — when the currently-live stage finishes play

**`tournament_matches` — new columns**
- `live_started_at timestamptz`
- `live_events jsonb default '[]'` — array of `{ at, minute, type, text }` for football commentary (goal, chance, save, card, kick-off, HT, FT); virtual variant uses generic phrasing

**`championship_start` RPC** — schedule-only:
- If called on `status='scheduled'` and `starts_at` is future → set `status='booking'`, `booking_closes_at = starts_at`, draw R16 pairings (so users see the bracket to bet on) but leave `status='booking'` until `booking_closes_at`
- If already past `starts_at` → skip booking, go straight to live

**New RPC `championship_tick(p_tournament uuid)`** replaces current tick:
1. `booking` → when `now() >= booking_closes_at`: set `status='live'`, `current_stage='R16'`, for each R16 match set `live_started_at = now()`, `current_stage_live_ends_at = now() + stage_live_seconds`, emit "Kick-off" events per match.
2. `live` + stage still playing (`now() < current_stage_live_ends_at`) → append random football/virtual commentary events (goal/chance/save/card) to each unfinished match's `live_events`, adjust scores on goals.
3. `live` + stage ended → finalize scores, set `winner_id`, status='completed' for each stage match, emit "Full time" event, then wait `stage_gap_seconds`: schedule `next_stage_starts_at`. When gap elapses, draw next round pairings, emit "Next round line-up" event to `broadcasts`/`live_events` on new matches, set new `current_stage_live_ends_at`.
4. Final completed → mark tournament completed; auto-restart honors existing flag.

**`bets` guard** — DB trigger rejects championship bets when tournament `status != 'booking'`; enforces "once per championship" via unique index on `(user_id, tournament_id)` in `championship_bets` (or add `tournament_id` if missing and unique-index it).

### 2. Server tick loop

The existing `/api/public/virtual-tick` route (or equivalent) already calls per-tournament tick. Extend to:
- Fetch all tournaments in `booking` or `live` status
- Call `championship_tick` for each every 2s

### 3. Frontend — `virtual.championship.tsx` + `virtual.football-championship.tsx`

Reorder page:
1. Header + status pill (BOOKING / LIVE stage / GAP)
2. **Countdown**:
   - `booking` → "Booking closes in mm:ss" (uses `booking_closes_at`)
   - `live` → "Stage ends in mm:ss" (uses `current_stage_live_ends_at`)
   - gap → "Next stage in mm:ss"
3. **Live feed** (moved up) — realtime stream of `live_events` for currently-live matches, plus "Next round line-up" cards when a stage completes showing the drawn matchups for the upcoming stage.
4. **Bracket** — standard bracket underneath the feed (existing component).
5. **Championship Markets** — disabled unless `status='booking'`; shows "Booking closed" message otherwise. Enforces one bet per tournament client-side (query existing bet, hide slip).

Rename BetSlip CTA from "Place bet" → "Stake bet" (already noted earlier).

### 4. `ChampionshipLiveFeed` rewrite

Subscribe to `tournament_matches` changes filtered by `tournament_id`. Render:
- **Live now** section — currently-live matches with running score + last 3 events (goal 27', save 33', etc.)
- **Just settled** — completed matches from the last stage with final score
- **Next up** — when in gap, list the drawn pairings for the next stage
Football variant uses soccer-flavoured event text; virtual variant uses generic ("SOLITUDE strikes!").

### 5. Admin — `ChampionshipAdminPanel`

Add three inputs (globally applied via `app_settings`):
- Booking window (seconds) — default 120
- Stage live duration (seconds) — default 30
- Stage gap (seconds) — existing, keep

Show these fields both in global settings block and as overrides when scheduling a specific tournament.

### 6. Bet Slip

Change primary CTA label from "Place bet" to "Stake bet" across `BetSlip.tsx` and `ChampionshipBetPanel.tsx` (already partly noted in prior turns).

### Technical notes / risks
- Adding `tournament_id` unique to `championship_bets` may conflict with existing rows if a tournament already has multiple bets per user — migration will `DELETE` duplicates keeping earliest (destructive; acceptable since test data).
- Commentary generation lives inside `championship_tick` SQL (uses `random()` weighted picks). Keeps engine fully server-driven.
- Existing `stage_gap_seconds` column stays; new fields are additive so existing tournaments keep working.

### Out of scope
- Real match physics/AI — commentary is randomized flavour text with scoreline drift.
- Per-user booking windows — booking is global per tournament.
- Redesign of Championship Markets tabs.
