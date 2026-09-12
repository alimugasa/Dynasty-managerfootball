import type { ReactNode } from 'react';
import { resolveEntityRoute, type EntityRef } from '../app/entity';
import { useNavigator } from '../app/navigation';

interface Props {
  to: EntityRef;
  children: ReactNode;
  className?: string;
  /** Set when the whole row is the target, so the hit area is the full row. */
  block?: boolean;
}

/** The only sanctioned way to navigate to a player, team, coach, college, game
 *  or draft pick. A player is provably the same player everywhere. */
export function EntityLink({ to, children, className, block = false }: Props) {
  const nav = useNavigator();
  const route = resolveEntityRoute(to);
  return (
    <button
      type="button"
      onClick={() => nav.push(route.screen, route.params)}
      className={className}
      style={{
        display: block ? 'block' : 'inline-flex',
        width: block ? '100%' : undefined,
        minHeight: 44,
        background: 'none',
        border: 0,
        padding: 0,
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
