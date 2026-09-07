import { useState } from 'react';
import { AbilityDial } from '../components/AbilityDial';
import { PerformanceChip } from '../components/PerformanceChip';
import { CompetitionToggle } from '../components/CompetitionToggle';
import { DataBoundary } from '../components/DataBoundary';
import { TableScroll } from '../components/TableScroll';
import { COLOR } from '../app/tokens';
import type { Competition } from '../domain/competition';
import { MissingData } from '../data/errors';

const H = ({ children }: { children: string }) => (
  <h2
    style={{
      fontFamily: "'Barlow Condensed', system-ui, sans-serif",
      color: COLOR.tx, fontSize: 18, letterSpacing: '.04em',
      margin: '26px 0 10px', textTransform: 'uppercase',
    }}
  >
    {children}
  </h2>
);

function Thrower(): never {
  throw new MissingData({ table: 'players', column: 'ovr', id: 'P100817_OT', screen: 'gallery' });
}

export function DevGallery() {
  const [comp, setComp] = useState<Competition>('REGULAR_SEASON');
  return (
    <main style={{ padding: 16 }}>
      <H>Ability — circular dial, amber arc</H>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {[0, 50, 74, 99, null].map((v, i) => (
          <AbilityDial key={i} value={v} />
        ))}
      </div>

      <H>Performance — chip, coloured left edge, six stops</H>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[95.4, 84.6, 74.7, 64.2, 54.8, 43.9, null].map((v, i) => (
          <PerformanceChip key={i} value={v} />
        ))}
      </div>

      <H>Competition toggle — one shared component</H>
      <CompetitionToggle value={comp} onChange={setComp} />
      <p style={{ color: COLOR.mut, fontSize: 13 }}>selected: {comp}</p>

      <H>TableScroll — table scrolls, page does not</H>
      <TableScroll>
        <table style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <tbody>
            <tr>
              {Array.from({ length: 14 }, (_, i) => (
                <td key={i} style={{ padding: '6px 14px', border: `1px solid ${COLOR.line}`, whiteSpace: 'nowrap' }}>
                  col {i + 1}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </TableScroll>

      <H>DataBoundary — missing data is reported, never faked</H>
      <DataBoundary screen="gallery">
        <Thrower />
      </DataBoundary>
      <div style={{ height: 40 }} />
    </main>
  );
}
