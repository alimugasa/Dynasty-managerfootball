-- 0019 · A player who washed out has not retired.
--
-- The retirement hazard's mode is the young end: fringe players nobody signs
-- leave the league at 25. The log called every departure a retirement, and
-- "Retired at 25" is false. WASHOUT is the kind for a player who left before
-- his positional peak; RETIREMENT is kept for the ones past it.
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in (
  'DRAFT_SELECTION','ROOKIE_SIGNING','FREE_AGENT_SIGNING','RE_SIGNING','RELEASE',
  'CONTRACT_EXPIRY','WASHOUT','TRADE','WAIVER_CLAIM','IR_PLACEMENT','IR_RETURN',
  'PRACTICE_SQUAD_SIGNING','RETIREMENT','CONTRACT_EXTENSION','COACH_HIRE','COACH_FIRE'));

comment on column public.players.retired_season is
  'The season the player left the league, by retirement or by washing out (see transactions.kind).';
