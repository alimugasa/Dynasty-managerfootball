// The two lines a screen adds to show faces.
//
// PlayerAvatar wants a seed, a position and an age; a screen has a player id
// and a map from useAvatars. This closes that gap in one place so thirteen
// screens do not each write the same three-field lookup and the same fallback
// decision -- and so a screen whose avatars read has not landed yet renders
// initials rather than nothing, without having to think about it.

import type { AvatarMap } from '../hooks/useAvatars';
import { AvatarFallback, PlayerAvatar } from './PlayerAvatar';
import type { PortraitSize } from './portrait';

interface Props {
  readonly avatars: AvatarMap;
  readonly playerId: string;
  readonly name: string;
  readonly size?: PortraitSize;
  /** The club's colours, where the screen knows which club he plays for. A
   *  screen that does not know passes nothing rather than guessing. */
  readonly primary?: string;
  readonly secondary?: string;
  readonly lazy?: boolean;
}

export function PlayerFace({
  avatars, playerId, name, size = 'list', primary, secondary, lazy,
}: Props) {
  const facts = avatars.get(playerId);
  if (facts === null) return <AvatarFallback name={name} size={size} />;
  return (
    <PlayerAvatar
      seed={facts.seed}
      name={name}
      position={facts.position}
      age={facts.age}
      heritage={facts.heritage}
      size={size}
      {...(primary === undefined ? {} : { primary })}
      {...(secondary === undefined ? {} : { secondary })}
      {...(lazy === undefined ? {} : { lazy })}
    />
  );
}
