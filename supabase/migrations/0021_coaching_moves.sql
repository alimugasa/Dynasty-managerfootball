-- 0021 · The coaching carousel, in the transaction log.
--
-- 0008 allowed a coach to be hired and fired. It did not allow him to retire
-- or to be promoted from inside, and both happen every winter: a coordinator
-- takes the chair, a sixty-eight-year-old head coach stops. Logging those as
-- a hire and a firing would say something untrue about what happened.
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in (
  'DRAFT_SELECTION','ROOKIE_SIGNING','FREE_AGENT_SIGNING','RE_SIGNING',
  'RELEASE','TRADE','WAIVER_CLAIM','IR_PLACEMENT','IR_RETURN',
  'PRACTICE_SQUAD_SIGNING','RETIREMENT','CONTRACT_EXPIRY','WASHOUT',
  'CONTRACT_EXTENSION','COACH_HIRE','COACH_FIRE','COACH_RETIRE','COACH_PROMOTE'));

-- A coaching move names a coach, not a player. The column that carries the
-- name is shared; the one that carries the id is not, so the coach's id goes
-- in the detail line beside what he did.
comment on column public.transactions.player_name is
  'The player, or -- on a COACH_ move -- the coach. player_id is null for a coach: he is not in players.';
