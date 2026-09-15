-- Dynasty Manager Pro - Postgres / Supabase schema
-- Run this file, then import the CSVs in the order the tables appear below.
-- All identifiers are original; no real person appears in this database.

create table if not exists "league_conferences" (
  "conference_id" text primary key,
  "name" text,
  "league_id" text,
  "data_class" text
);

create table if not exists "league_divisions" (
  "division_id" text primary key,
  "conference_id" text,
  "name" text,
  "region" text,
  "data_class" text
  , constraint fk_league_divisions_conference_id foreign key ("conference_id") references "league_conferences"("conference_id")
);

create table if not exists "teams" (
  "team_id" text primary key,
  "metro_area" text,
  "nickname" text,
  "division_id" text,
  "conference_id" text,
  "primary_color" text,
  "secondary_color" text,
  "founded_year" integer,
  "market_size" integer,
  "stadium_id" text,
  "owner_id" text,
  "data_class" text
  , constraint fk_teams_division_id foreign key ("division_id") references "league_divisions"("division_id")
);

create table if not exists "owners" (
  "owner_id" text primary key,
  "team_id" text,
  "owner_name" text,
  "ownership_type" text,
  "archetype" text,
  "tenure_years" integer,
  "patience" integer,
  "spending_willingness" integer,
  "meddling" integer,
  "win_now_bias" numeric,
  "market_size" integer,
  "franchise_value_musd" bigint,
  "data_class" text
  , constraint fk_owners_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "stadiums" (
  "stadium_id" text primary key,
  "team_id" text,
  "name" text,
  "capacity" integer,
  "roof_type" text,
  "surface" text,
  "opened_year" integer,
  "city" text,
  "state" text,
  "data_class" text
  , constraint fk_stadiums_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "colleges" (
  "college_id" text primary key,
  "name" text,
  "abbreviation" text,
  "conference" text,
  "conference_abbr" text,
  "division_tier" integer,
  "talent_level" integer,
  "nfl_pipeline_rate" numeric,
  "data_class" text
);

create table if not exists "coaches" (
  "coach_id" text primary key,
  "display_name" text,
  "team_id" text,
  "role" text,
  "age" integer,
  "years_experience" integer,
  "coaching_tree" text,
  "prior_head_coach" integer,
  "contract_years_remaining" integer,
  "hot_seat_rating" integer,
  "overall_rating" integer,
  "data_class" text
);

create table if not exists "coach_attributes" (
  "coach_id" text primary key,
  "play_calling" integer,
  "game_management" integer,
  "player_development" integer,
  "talent_evaluation" integer,
  "leadership" integer,
  "adaptability" integer,
  "aggressiveness" integer,
  "discipline" integer,
  "motivation" integer,
  "staff_management" integer,
  "scheme_innovation" integer,
  "clock_management" integer,
  "data_class" text
  , constraint fk_coach_attributes_coach_id foreign key ("coach_id") references "coaches"("coach_id")
);

create table if not exists "team_coaching_staff" (
  "team_id" text,
  "coach_id" text,
  "role" text,
  "side_of_ball" text,
  "years_with_team" integer,
  "play_calling_duty" integer,
  "data_class" text
  , constraint fk_team_coaching_staff_coach_id foreign key ("coach_id") references "coaches"("coach_id")
  , constraint fk_team_coaching_staff_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "team_schemes" (
  "team_id" text,
  "offensive_scheme" text,
  "offensive_identity" text,
  "run_pass_balance" numeric,
  "tempo" text,
  "defensive_scheme" text,
  "base_front" text,
  "coverage_tendency" text,
  "blitz_rate" numeric,
  "fourth_down_aggression" integer,
  "data_class" text
  , constraint fk_team_schemes_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "players" (
  "player_id" text primary key,
  "display_name" text,
  "team_id" text,
  "position" text,
  "position_group" text,
  "jersey_number" integer,
  "height_inches" integer,
  "weight_lbs" integer,
  "age" integer,
  "experience_years" integer,
  "college_id" text,
  "college_name" text,
  "draft_year" integer,
  "draft_round" integer,
  "draft_pick_in_round" integer,
  "draft_overall_pick" integer,
  "draft_status" text,
  "rookie_flag" integer,
  "roster_status" text,
  "designation" text,
  "depth_rank" integer,
  "role_tier" text,
  "overall_rating" integer,
  "potential_rating" integer,
  "data_class" text
  , constraint fk_players_college_id foreign key ("college_id") references "colleges"("college_id")
);

create table if not exists "player_attributes" (
  "player_id" text primary key,
  "position" text,
  "speed" integer,
  "acceleration" integer,
  "agility" integer,
  "strength" integer,
  "stamina" integer,
  "durability" integer,
  "awareness" integer,
  "football_iq" integer,
  "work_ethic" integer,
  "consistency" integer,
  "anchor" integer,
  "ball_skills" integer,
  "blitzing" integer,
  "block_shedding" integer,
  "break_tackle" integer,
  "carrying" integer,
  "catch_in_traffic" integer,
  "catching" integer,
  "clutch" integer,
  "contact_balance" integer,
  "coverage" integer,
  "decision_making" integer,
  "deep_accuracy" integer,
  "directional" integer,
  "elusiveness" integer,
  "finesse_move" integer,
  "hang_time" integer,
  "kick_accuracy" integer,
  "kick_power" integer,
  "kickoff_power" integer,
  "lead_block" integer,
  "line_calls" integer,
  "man_coverage" integer,
  "medium_accuracy" integer,
  "pass_block" integer,
  "pass_protection" integer,
  "pass_rush" integer,
  "play_action" integer,
  "play_recognition" integer,
  "pocket_presence" integer,
  "power" integer,
  "power_move" integer,
  "press" integer,
  "pressure_handling" integer,
  "punt_accuracy" integer,
  "punt_power" integer,
  "pursuit" integer,
  "receiving" integer,
  "release" integer,
  "route_running" integer,
  "run_block" integer,
  "run_defense" integer,
  "run_support" integer,
  "scrambling" integer,
  "second_level" integer,
  "separation" integer,
  "short_accuracy" integer,
  "snap_accuracy" integer,
  "snap_speed" integer,
  "spectacular_catch" integer,
  "tackling" integer,
  "technique" integer,
  "throw_on_run" integer,
  "throw_power" integer,
  "vision" integer,
  "zone_coverage" integer,
  "data_class" text
  , constraint fk_player_attributes_player_id foreign key ("player_id") references "players"("player_id")
);

create table if not exists "player_contracts" (
  "contract_id" text primary key,
  "player_id" text,
  "team_id" text,
  "contract_type" text,
  "start_year" integer,
  "end_year" integer,
  "years_total" integer,
  "years_remaining" integer,
  "total_value" bigint,
  "average_annual_value" bigint,
  "base_salary_2026" bigint,
  "signing_bonus_total" bigint,
  "bonus_proration_2026" bigint,
  "roster_bonus_2026" bigint,
  "guaranteed_money" bigint,
  "cap_hit_2026" bigint,
  "dead_cap_if_cut_2026" bigint,
  "no_trade_clause" integer,
  "contract_status" text,
  "data_class" text
  , constraint fk_player_contracts_player_id foreign key ("player_id") references "players"("player_id")
  , constraint fk_player_contracts_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "player_morale" (
  "player_id" text primary key,
  "team_id" text,
  "morale" integer,
  "playing_time_satisfaction" integer,
  "contract_satisfaction" integer,
  "coach_trust" integer,
  "locker_room_influence" integer,
  "trade_request" integer,
  "holdout_risk" integer,
  "data_class" text
  , constraint fk_player_morale_player_id foreign key ("player_id") references "players"("player_id")
);

create table if not exists "player_traits" (
  "player_id" text,
  "trait" text,
  "data_class" text
  , constraint fk_player_traits_player_id foreign key ("player_id") references "players"("player_id")
);

create table if not exists "player_injuries" (
  "player_id" text,
  "team_id" text,
  "designation" text,
  "injury_type" text,
  "weeks_out_estimate" integer,
  "season_ending" integer,
  "data_class" text
  , constraint fk_player_injuries_player_id foreign key ("player_id") references "players"("player_id")
  , constraint fk_player_injuries_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "team_rosters" (
  "team_id" text,
  "player_id" text,
  "position" text,
  "jersey_number" integer,
  "roster_status" text,
  "designation" text,
  "depth_rank" integer,
  "acquisition_type" text,
  "acquisition_year" integer,
  "active_status" integer,
  "data_class" text
  , constraint fk_team_rosters_player_id foreign key ("player_id") references "players"("player_id")
  , constraint fk_team_rosters_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "team_depth_charts" (
  "team_id" text,
  "unit" text,
  "slot" text,
  "slot_position" text,
  "depth_order" integer,
  "player_id" text,
  "player_position" text,
  "is_starter" integer,
  "data_class" text
  , constraint fk_team_depth_charts_player_id foreign key ("player_id") references "players"("player_id")
  , constraint fk_team_depth_charts_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "season_schedule" (
  "game_id" text primary key,
  "season" integer,
  "week" integer,
  "game_date" date,
  "kickoff_local" text,
  "home_team_id" text,
  "away_team_id" text,
  "venue" text,
  "venue_city" text,
  "roof" text,
  "surface" text,
  "divisional_game" integer,
  "conference_game" integer,
  "primetime" integer,
  "status" text,
  "home_score" text,
  "away_score" text,
  "data_class" text
  , constraint fk_season_schedule_home_team_id foreign key ("home_team_id") references "teams"("team_id")
  , constraint fk_season_schedule_away_team_id foreign key ("away_team_id") references "teams"("team_id")
);

create table if not exists "team_bye_weeks" (
  "season" integer,
  "team_id" text,
  "bye_week" integer
  , constraint fk_team_bye_weeks_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "free_agents" (
  "player_id" text,
  "display_name" text,
  "position" text,
  "age" integer,
  "experience_years" integer,
  "overall_rating" integer,
  "previous_team_id" text,
  "market_asking_aav" bigint,
  "expected_years" integer,
  "interest_level" integer,
  "fa_type" text,
  "data_class" text
  , constraint fk_free_agents_player_id foreign key ("player_id") references "players"("player_id")
);

create table if not exists "draft_picks" (
  "pick_id" text primary key,
  "draft_year" integer,
  "round" integer,
  "pick_in_round" integer,
  "overall_pick" integer,
  "original_team_id" text,
  "current_owner_team_id" text,
  "compensatory" integer,
  "data_class" text
  , constraint fk_draft_picks_original_team_id foreign key ("original_team_id") references "teams"("team_id")
  , constraint fk_draft_picks_current_owner_team_id foreign key ("current_owner_team_id") references "teams"("team_id")
);

create table if not exists "draft_classes" (
  "prospect_id" text primary key,
  "draft_year" integer,
  "display_name" text,
  "position" text,
  "position_group" text,
  "college_id" text,
  "college_name" text,
  "age" integer,
  "height_inches" integer,
  "weight_lbs" integer,
  "scout_grade" numeric,
  "projected_round" text,
  "floor_rating" integer,
  "ceiling_rating" integer,
  "bust_risk" integer,
  "forty_yard" numeric,
  "scouting_confidence" text,
  "prospect_class" text,
  "data_class" text
  , constraint fk_draft_classes_college_id foreign key ("college_id") references "colleges"("college_id")
);

create table if not exists "franchise_finances" (
  "team_id" text,
  "season" integer,
  "salary_cap" bigint,
  "top51_cap_spend" bigint,
  "cap_space" bigint,
  "dead_cap" bigint,
  "cash_spend" bigint,
  "local_revenue" bigint,
  "national_revenue" bigint,
  "total_revenue" bigint,
  "operating_expenses" bigint,
  "operating_income" bigint,
  "stadium_capacity" integer,
  "market_size" integer,
  "data_class" text
  , constraint fk_franchise_finances_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "salary_cap" (
  "team_id" text,
  "season" integer,
  "cap_limit" integer,
  "committed" bigint,
  "dead_money" bigint,
  "available" bigint,
  "contracts_counted" integer,
  "rollover_from_2025" bigint,
  "data_class" text
  , constraint fk_salary_cap_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "team_needs" (
  "team_id" text,
  "need_rank" integer,
  "position" text,
  "starter_avg_rating" numeric,
  "severity" text,
  "data_class" text
  , constraint fk_team_needs_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "owner_goals" (
  "goal_id" text,
  "team_id" text,
  "owner_id" text,
  "season" integer,
  "goal_type" text,
  "description" text,
  "target_value" integer,
  "priority" text,
  "franchise_posture" text,
  "patience_if_missed" integer,
  "reward_points" integer,
  "status" text,
  "data_class" text
  , constraint fk_owner_goals_team_id foreign key ("team_id") references "teams"("team_id")
);

create table if not exists "data_provenance" (
  "file" text,
  "data_class" text,
  "notes" text,
  "row_count" integer,
  "contains_real_people" text
);

-- Indexes for the queries a franchise sim actually runs
create index if not exists idx_team_rosters_team_id on "team_rosters" ("team_id");
create index if not exists idx_team_depth_charts_team_id on "team_depth_charts" ("team_id");
create index if not exists idx_player_contracts_team_id on "player_contracts" ("team_id");
create index if not exists idx_players_team_id on "players" ("team_id");
create index if not exists idx_players_position on "players" ("position");
create index if not exists idx_season_schedule_week on "season_schedule" ("week");
create index if not exists idx_season_schedule_home_team_id on "season_schedule" ("home_team_id");
create index if not exists idx_team_coaching_staff_team_id on "team_coaching_staff" ("team_id");
create index if not exists idx_player_traits_player_id on "player_traits" ("player_id");
create index if not exists idx_draft_picks_current_owner_team_id on "draft_picks" ("current_owner_team_id");

-- Standings view, refreshed as results are written back to season_schedule
create or replace view v_standings as
select t.team_id, t.metro_area, t.nickname, t.division_id, t.conference_id,
       count(*) filter (where g.status = 'FINAL') as games_played,
       count(*) filter (where g.status = 'FINAL' and
             ((g.home_team_id = t.team_id and g.home_score > g.away_score) or
              (g.away_team_id = t.team_id and g.away_score > g.home_score))) as wins,
       count(*) filter (where g.status = 'FINAL' and
             ((g.home_team_id = t.team_id and g.home_score < g.away_score) or
              (g.away_team_id = t.team_id and g.away_score < g.home_score))) as losses
from teams t
left join season_schedule g
       on t.team_id in (g.home_team_id, g.away_team_id)
group by t.team_id, t.metro_area, t.nickname, t.division_id, t.conference_id;