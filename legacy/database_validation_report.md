# Dynasty Manager Pro - Database Validation Report

Generated 2026-08-27  
**Overall result: PASS**

- Checks passed: **72**
- Warnings: **0**
- Failures: **0**


## Table inventory

| File | Rows | Columns |
|---|---:|---:|
| coach_attributes.csv | 526 | 14 |
| coaches.csv | 526 | 12 |
| colleges.csv | 260 | 9 |
| data_provenance.csv | 27 | 5 |
| draft_classes.csv | 392 | 19 |
| draft_picks.csv | 448 | 9 |
| franchise_finances.csv | 32 | 15 |
| free_agents.csv | 186 | 12 |
| league_conferences.csv | 2 | 4 |
| league_divisions.csv | 8 | 5 |
| owner_goals.csv | 96 | 13 |
| owners.csv | 32 | 13 |
| player_attributes.csv | 3,066 | 69 |
| player_contracts.csv | 2,880 | 20 |
| player_injuries.csv | 309 | 7 |
| player_morale.csv | 3,066 | 10 |
| player_traits.csv | 4,333 | 3 |
| players.csv | 3,066 | 25 |
| salary_cap.csv | 32 | 9 |
| season_schedule.csv | 272 | 18 |
| stadiums.csv | 32 | 10 |
| team_bye_weeks.csv | 32 | 3 |
| team_coaching_staff.csv | 480 | 7 |
| team_depth_charts.csv | 1,952 | 9 |
| team_needs.csv | 160 | 6 |
| team_rosters.csv | 2,880 | 11 |
| team_schemes.csv | 32 | 11 |
| teams.csv | 32 | 12 |

**Total rows: 25,159** across 28 tables


## Passed checks

- players.player_id unique (3066 rows, 0 dupes)
- coaches.coach_id unique (526 rows, 0 dupes)
- teams.team_id unique (32 rows, 0 dupes)
- colleges.college_id unique (260 rows, 0 dupes)
- player_contracts.contract_id unique (2880 rows, 0 dupes)
- season_schedule.game_id unique (272 rows, 0 dupes)
- draft_picks.pick_id unique (448 rows, 0 dupes)
- stadiums.stadium_id unique (32 rows, 0 dupes)
- owners.owner_id unique (32 rows, 0 dupes)
- draft_classes.prospect_id unique (392 rows, 0 dupes)
- players.display_name unique (0 collisions)
- FK teams.division_id -> valid (0 orphans)
- FK league_divisions.conference_id -> valid (0 orphans)
- FK players.college_id -> valid (0 orphans)
- FK player_attributes.player_id -> valid (0 orphans)
- FK player_contracts.player_id -> valid (0 orphans)
- FK player_morale.player_id -> valid (0 orphans)
- FK player_traits.player_id -> valid (0 orphans)
- FK player_injuries.player_id -> valid (0 orphans)
- FK team_rosters.player_id -> valid (0 orphans)
- FK team_rosters.team_id -> valid (0 orphans)
- FK team_depth_charts.player_id -> valid (0 orphans)
- FK team_depth_charts.team_id -> valid (0 orphans)
- FK team_coaching_staff.coach_id -> valid (0 orphans)
- FK team_coaching_staff.team_id -> valid (0 orphans)
- FK coach_attributes.coach_id -> valid (0 orphans)
- FK team_schemes.team_id -> valid (0 orphans)
- FK franchise_finances.team_id -> valid (0 orphans)
- FK salary_cap.team_id -> valid (0 orphans)
- FK owner_goals.team_id -> valid (0 orphans)
- FK team_needs.team_id -> valid (0 orphans)
- FK stadiums.team_id -> valid (0 orphans)
- FK owners.team_id -> valid (0 orphans)
- FK free_agents.player_id -> valid (0 orphans)
- FK draft_picks.original_team_id -> valid (0 orphans)
- FK draft_picks.current_owner_team_id -> valid (0 orphans)
- FK draft_classes.college_id -> valid (0 orphans)
- FK season_schedule.home_team_id -> valid (0 orphans)
- FK season_schedule.away_team_id -> valid (0 orphans)
- FK team_bye_weeks.team_id -> valid (0 orphans)
- FK players.team_id -> teams|FA (0 orphans)
- team_id columns use abbreviations only (0 violations)
- all team_id values are <=3 char abbreviations
- no player on two rosters (0 dupes)
- contract team matches roster team (0 mismatches)
- every player has an attributes row (0 missing)
- every player has a morale row (0 missing)
- player attribute ratings within 0-100 (0 out of range)
- player overall/potential within 0-100 (0 out of range)
- coach ratings within 0-100 (0 out of range)
- player ages within 20-45 (0 out of range)
- morale within 0-100 (0 out of range)
- potential >= overall (0 violations)
- contract end_year >= start_year (0 violations)
- 90 players per club (found [90])
- 53 active per club (found [53])
- 17 games per club (found [17])
- 8-9 home games per club (found [8, 9])
- 272 total games (found 272)
- no club plays twice in a week (0 clashes)
- every club has exactly one bye
- byes fall in weeks 5-14 (0 outside)
- no club plays during its bye (0 violations)
- no club scheduled against itself
- exactly one starter per slot (0 bad slots)
- depth charts only use active-roster players (0 violations)
- depth chart players belong to that club (0 violations)
- exactly one head coach per club (found [1])
- no coach assigned to two clubs
- cap space in a plausible band (0 clubs outside -$20M..+$90M)
- provenance declares no real individuals in any table
- all future prospects flagged as generated, never presented as real

## Intentional nulls

Blank cells are deliberate: position-specific attribute columns are null for positions they do not apply to, undrafted players carry no draft round or pick, and free agents carry no jersey number or depth rank. No value was invented to fill a column.

| File | Column | Blank | Of |
|---|---|---:|---:|
| player_attributes.csv | lead_block | 3,032 | 3,066 |
| player_attributes.csv | snap_speed | 3,031 | 3,066 |
| player_attributes.csv | clutch | 2,999 | 3,066 |
| player_attributes.csv | kick_accuracy | 2,999 | 3,066 |
| player_attributes.csv | kick_power | 2,999 | 3,066 |
| player_attributes.csv | kickoff_power | 2,999 | 3,066 |
| player_attributes.csv | directional | 2,998 | 3,066 |
| player_attributes.csv | hang_time | 2,998 | 3,066 |
| player_attributes.csv | punt_accuracy | 2,998 | 3,066 |
| player_attributes.csv | punt_power | 2,998 | 3,066 |
| player_attributes.csv | line_calls | 2,964 | 3,066 |
| player_attributes.csv | decision_making | 2,929 | 3,066 |
| player_attributes.csv | deep_accuracy | 2,929 | 3,066 |
| player_attributes.csv | medium_accuracy | 2,929 | 3,066 |
| player_attributes.csv | play_action | 2,929 | 3,066 |
| player_attributes.csv | pocket_presence | 2,929 | 3,066 |
| player_attributes.csv | pressure_handling | 2,929 | 3,066 |
| player_attributes.csv | scrambling | 2,929 | 3,066 |
| player_attributes.csv | short_accuracy | 2,929 | 3,066 |
| player_attributes.csv | snap_accuracy | 2,929 | 3,066 |
| player_attributes.csv | throw_on_run | 2,929 | 3,066 |
| player_attributes.csv | throw_power | 2,929 | 3,066 |