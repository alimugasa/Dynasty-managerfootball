// The five ways a general manager says he sees the job.
//
// The keys live on the server because the server is what refuses an unknown
// one: a client that could invent a style could write a value the migration's
// CHECK has never heard of, and the constraint would answer with a 500 rather
// than a sentence. The labels and the one-line explanations live on the client,
// in src/screens/gmStyles.ts, because they are copy; a test asserts the two
// lists name the same five keys, so neither can drift without saying so.
//
// Nothing in the simulation reads a style yet. It is stored because the screen
// asks for it, and a question the save discards is a question that should not
// have been asked.

export const GM_STYLES = [
  'ARCHITECT', 'TALENT_SCOUT', 'NEGOTIATOR', 'CULTURE_BUILDER', 'STRATEGIST',
] as const;

export type GmStyle = (typeof GM_STYLES)[number];

export function isGmStyle(value: string): value is GmStyle {
  return (GM_STYLES as readonly string[]).includes(value);
}
