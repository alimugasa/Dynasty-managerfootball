# superseded/

`0001_initial_schema.sql` was the staged copy of the 28-table seed schema. It was
never applied to any database.

It is superseded by `../0001_foundation.sql` through `../0010_create_save.sql`,
which carry the same tables and column names plus `save_id` scoping, forced
row-level security, primary keys on the thirteen tables that had none, and the
corrections listed in `docs/SCHEMA.md`. Those changes could not be retrofitted:
primary keys become composite `(save_id, natural_id)` and every foreign key
becomes composite with them, which is a rewrite rather than a set of `ALTER`s.

Nothing is lost by superseding it. The file is byte-identical to
`legacy/seed/schema_supabase.sql`, which is frozen and remains the record of the
schema the seed CSVs were exported against.

It is kept here, outside the apply path, because the Supabase CLI reads only
`*.sql` at the top level of `migrations/`. Delete it whenever you like.
