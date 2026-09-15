# supabase/

Migration-first. Every schema change — table, column, index, constraint, view,
function, policy — exists as a numbered SQL file here and is applied through the
migration tool. **Never typed into the dashboard.** A schema that lives only in the
dashboard cannot be reviewed, reverted, or recreated, and at ~48 tables that becomes
unrecoverable fast.

```
migrations/
  0001_foundation.sql            profiles, saves, the RLS predicate
  0002_world_league.sql          leagues, conferences, divisions, teams, venues
  0003_world_staff.sql           coaches, attributes, staffs, schemes
  0004_world_players.sql         players, attributes, traits, morale, injuries
  0005_world_roster_contracts.sql rosters, depth charts, contracts, cap
  0006_world_schedule_draft.sql  schedule, draft capital, prospects, scouting
  0007_runtime_results.sql       results, season stats, grades, standings
  0008_runtime_history.sql       transactions, awards, honours, history, news
  0009_rls.sql                   forced RLS on all 45 tables + self-verification
  0010_create_save.sql           create_save(), the template clone
  superseded/                    the original staged seed schema; not applied
seed/                            CSV import harness
tests/                           local shim + RLS suite; see run-local.sh
functions/                       Edge functions — the ported simulation
```

Design rationale, the denormalization register, the defects corrected from the
seed schema and per-season row growth are in `docs/SCHEMA.md`.

Validate any change before it reaches a real project:

```bash
supabase/tests/run-local.sh
```

## Import order for the 28 seed CSVs (Prompts 0029–0036)

Not cosmetic. `teams` must precede `owners` and `stadiums`; both carry foreign keys
back to it.

```
league_conferences, league_divisions, teams, owners, stadiums, colleges,
coaches, coach_attributes, team_coaching_staff, team_schemes,
players, player_attributes, player_contracts, player_morale, player_traits,
player_injuries, team_rosters, team_depth_charts, season_schedule,
team_bye_weeks, free_agents, draft_picks, draft_classes, franchise_finances,
salary_cap, team_needs, owner_goals, data_provenance
```

## Missing runtime layer

This schema describes the **starting world only**. Searching it for save, user, auth
or policy returns zero matches. Save slots, calendar state, results, box scores,
standings, season statistics, season grades, awards, honours, records, transactions,
news, in-game draft classes and scouting do not exist yet. They are specified in
Prompt 0038 and created in Prompts 0039–0041.
