// Generated from legacy/seed/schema_supabase.sql — the authoritative schema.
// Column names, order and nullability mirror the SQL exactly. Do not rename to
// camelCase and do not add fields the schema does not have.

/** Table `data_provenance` — 5 columns. */
export interface DataProvenance {
  file: string | null;
  data_class: string | null;
  notes: string | null;
  row_count: number | null;
  contains_real_people: string | null;
}
