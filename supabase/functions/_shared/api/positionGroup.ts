import { GROUP_OF } from '../engine/careerWorld.ts';
import { POSITION_GROUPS, type PositionGroup } from '../engine/types.ts';

/** Seed players use finer positions (OT/OG/C); generated players store the
 * engine group itself (OL). Both are authoritative representations. */
export function positionGroup(position: string): PositionGroup | undefined {
  const canonical = POSITION_GROUPS.find((group) => group === position);
  return canonical === undefined ? GROUP_OF[position] : canonical;
}
