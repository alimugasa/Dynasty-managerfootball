-- 0018 · A transaction kind for a contract that ran out.
--
-- The offseason expires every deal at zero years remaining and the log had no
-- kind for it, so the most common move of the year went unrecorded. An expiry
-- is not a release: no club chose it and no dead money is charged.
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in (
  'DRAFT_SELECTION','ROOKIE_SIGNING','FREE_AGENT_SIGNING','RE_SIGNING','RELEASE',
  'CONTRACT_EXPIRY','TRADE','WAIVER_CLAIM','IR_PLACEMENT','IR_RETURN',
  'PRACTICE_SQUAD_SIGNING','RETIREMENT','CONTRACT_EXTENSION','COACH_HIRE','COACH_FIRE'));
