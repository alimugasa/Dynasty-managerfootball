-- 0031 · The league's own names, and the columns a label is built from.
--
-- Two problems, one of them serious.
--
-- The serious one: the conferences shipped as "American Conference" (AC) and
-- "National Conference" (NC). Those are one word away from the two real
-- conferences of a real league, and docs/IP-POLICY.md does not allow that. The
-- denylist already refused those two conferences' initials and never saw these
-- spellings, because it reads source and these lived in a seed CSV -- which is
-- the gap worth remembering. They become the Atlas Conference and the
-- Frontier Conference, and both spellings join the denylist so they cannot
-- come back through a seed import.
--
-- The ordinary one: the divisions were called "AC East", so a screen that
-- wanted "East" got it by cutting the conference id off the front of a display
-- string, and a screen that wanted a short label printed the id and got
-- "AC · AC-E", which tells a player nothing. Labels are now built from
-- structure -- an abbreviation, a short name and a region, each its own column
-- -- rather than by string surgery on a name.
--
-- The ids are left alone. `conference_id` is 'AC' and 'NC' before this
-- migration and after it, because five tables carry it as a foreign key with
-- no ON UPDATE CASCADE between them, and repointing all of them across every
-- save is real risk taken for an internal spelling no player ever sees. It
-- does mean 'NC' is now the id of the Frontier Conference, which is why the
-- abbreviation is a column rather than something derived from the key: nothing
-- may infer a label from an id again.

alter table public.league_conferences
  add column if not exists abbreviation text,
  add column if not exists short_name text;

comment on column public.league_conferences.abbreviation is
  'The two-letter label, e.g. AC. NOT derived from conference_id -- the ids predate the names and no longer match them.';
comment on column public.league_conferences.short_name is
  'The conference in one word, e.g. Atlas, for a compact label like "Atlas East".';

-- Every save, the template included. Names are not keys, so this is a rename
-- and nothing points at it.
update public.league_conferences
   set name = 'Atlas Conference', abbreviation = 'AC', short_name = 'Atlas'
 where conference_id = 'AC';

update public.league_conferences
   set name = 'Frontier Conference', abbreviation = 'FC', short_name = 'Frontier'
 where conference_id = 'NC';

-- A conference this migration has never heard of keeps its name and is given
-- an abbreviation and a short name from it, rather than being left null and
-- failing the NOT NULL below. Nothing in the shipped seed takes this path.
update public.league_conferences
   set abbreviation = upper(left(name, 2)), short_name = split_part(name, ' ', 1)
 where abbreviation is null or short_name is null;

alter table public.league_conferences
  alter column abbreviation set not null,
  alter column short_name set not null;

-- The division's name is its full display name, built from the conference it
-- belongs to and the region it covers. The short and compact labels are built
-- from those two columns in one shared module rather than stored a third time.
update public.league_divisions d
   set name = c.name || ' ' || d.region
  from public.league_conferences c
 where c.save_id = d.save_id and c.conference_id = d.conference_id
   and d.region is not null;

-- Four regions, so a division cannot arrive spelled "Eastern" and quietly
-- produce a label nothing else in the product uses.
alter table public.league_divisions
  drop constraint if exists league_divisions_region_check;

alter table public.league_divisions
  add constraint league_divisions_region_check
  check (region in ('East', 'North', 'South', 'West'));

comment on column public.league_divisions.region is
  'East, North, South or West. The half of a division label that is not the conference.';
comment on column public.league_divisions.name is
  'The full display name, e.g. "Atlas Conference East". Short and compact labels are built from the conference and the region, never by cutting this string.';
