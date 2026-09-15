// What a save file says about itself, as plain functions.
//
// Pure, so they can be read and tested without rendering a card, and separate
// from the card because they are the part with judgement in them: every one of
// these decides what to print when the server does not know the answer, and
// that decision is ARCHITECTURE.md rule 3 rather than a layout choice.

import { PHASE_LABEL } from '../domain/phase';
import type { SlotRow } from '../../supabase/functions/_shared/api/reads/slots';

/** The record, or an honest blank: a save whose table has not been written yet
 *  has no record, and 0-0 would be a claim rather than an absence. */
export function recordOf(slot: SlotRow): string {
  if (slot.wins === null || slot.losses === null) return '—';
  const ties = slot.ties !== null && slot.ties > 0 ? `-${String(slot.ties)}` : '';
  return `${String(slot.wins)}-${String(slot.losses)}${ties}`;
}

/** Where in the year it is. During the regular season the week is the useful
 *  half; outside it, the phase is. */
export function whenIn(slot: SlotRow): string {
  if (slot.season === null || slot.phase === null) return '—';
  const where = slot.phase === 'REGULAR_SEASON' && slot.week !== null
    ? `Week ${String(slot.week)}`
    : PHASE_LABEL[slot.phase] ?? slot.phase;
  return `${String(slot.season)} · ${where}`;
}

/**
 * Cap space, in the units a cap is talked about in.
 *
 * Millions to one decimal, which is how every number in this game's world is
 * quoted. Null is a dash: no cap sheet for that season is not zero space, and
 * showing it as zero would be inventing the tightest possible cap position.
 */
export function capOf(slot: SlotRow): string {
  if (slot.capSpace === null) return '—';
  const sign = slot.capSpace < 0 ? '-' : '';
  return `${sign}$${(Math.abs(slot.capSpace) / 1e6).toFixed(1)}M`;
}

/** Local date, short. The server sends an instant; the browser knows the zone
 *  and the server does not.
 *
 *  The year appears only when it is not this one. A column narrow enough for a
 *  320px phone cannot hold "Sep 9, 2026" without cutting it, and on a save made
 *  this year the year is the part carrying no information. */
export function savedAt(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'unreadable';
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: '2-digit' }),
  });
}
