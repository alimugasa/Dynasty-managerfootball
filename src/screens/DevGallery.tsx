import { useState } from 'react';
import { AbilityDial } from '../components/AbilityDial';
import { PerformanceChip } from '../components/PerformanceChip';
import { CompetitionToggle } from '../components/CompetitionToggle';
import { DataBoundary } from '../components/DataBoundary';
import { TableScroll } from '../components/TableScroll';
import { ChipRow } from '../components/ChipRow';
import { ListRow } from '../components/ListRow';
import { StatTiles } from '../components/StatTiles';
import { TeamMark } from '../components/TeamMark';
import { Caption, EmptyState, Panel, SectionHeader } from '../components/Surface';
import {
  SkeletonRegion, SkeletonRows, SkeletonTable, SkeletonTiles,
} from '../components/Skeleton';
import { COLOR } from '../app/tokens';
import type { Competition } from '../domain/competition';
import { MissingData } from '../data/errors';

// Sample props, not game data. These exist so the primitives can be inspected
// in isolation; nothing here is read from or written to the simulation.
const SAMPLE_CLUBS = [
  { abbreviation: 'BUF', primary: '#12376B', secondary: '#C8102E', metro: 'Buffalo', nickname: 'Stampede' },
  { abbreviation: 'MIA', primary: '#00857D', secondary: '#F26522', metro: 'Miami', nickname: 'Barracuda' },
  { abbreviation: 'GB', primary: '#22453A', secondary: '#D8C99B', metro: 'Green Bay', nickname: 'Lumberjacks' },
];

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
  const [chip, setChip] = useState('all');
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

      <H>Skeletons — loading states, never spinners</H>
      <p style={{ color: COLOR.mut, fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>
        Each mirrors the component it stands in for, so the page keeps its shape
        when the data arrives instead of reflowing around it.
      </p>
      <SkeletonRegion label="Gallery skeleton sample">
        <SkeletonTiles count={3} />
        <div style={{ height: 10 }} />
        <SkeletonRows rows={3} />
        <div style={{ height: 10 }} />
        <TableScroll><SkeletonTable rows={3} columns={6} /></TableScroll>
      </SkeletonRegion>

      <H>Team marks — generated, never drawn</H>
      <p style={{ color: COLOR.mut, fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>
        Built from two colours and an abbreviation. No artwork ships; see
        docs/IP-POLICY.md.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {SAMPLE_CLUBS.map((club) => (
          <TeamMark
            key={club.abbreviation}
            abbreviation={club.abbreviation}
            primary={club.primary}
            secondary={club.secondary}
            size={44}
          />
        ))}
      </div>

      <H>Stat tiles</H>
      <StatTiles stats={[
        { label: 'Record', value: '11-6' },
        { label: 'Streak', value: 'W3', tone: 'positive' },
        { label: 'Cap space', value: null },
      ]} />
      <p style={{ color: COLOR.mut, fontSize: 12, margin: '8px 0 0' }}>
        <Caption>Note</Caption>{' '}
        a missing value renders as a dash, never as zero.
      </p>

      <H>Chips — scroll inside themselves</H>
      <ChipRow
        chips={[
          { key: 'all', label: 'All' }, { key: 'QB', label: 'QB' },
          { key: 'RB', label: 'RB' }, { key: 'WR', label: 'WR' },
          { key: 'TE', label: 'TE' }, { key: 'OL', label: 'OL' },
          { key: 'EDGE', label: 'Edge' }, { key: 'CB', label: 'CB' },
        ]}
        value={chip}
        onChange={setChip}
        label="Gallery filter"
      />

      <H>Rows</H>
      <Panel padded={false}>
        <div style={{ padding: '0 12px' }}>
          {SAMPLE_CLUBS.map((club) => (
            <ListRow
              key={club.abbreviation}
              leading={(
                <TeamMark
                  abbreviation={club.abbreviation}
                  primary={club.primary}
                  secondary={club.secondary}
                />
              )}
              title={`${club.metro} ${club.nickname}`}
              subtitle="Sample row"
              navigable
            />
          ))}
        </div>
      </Panel>

      <SectionHeader title="Section header" />
      <Panel>
        <EmptyState
          title="Nothing here"
          detail="Empty is a fact. Unavailable is a defect. They must not look alike."
        />
      </Panel>

      <H>TableScroll — table scrolls, page does not</H>
      {/* Marked so the end-to-end assertion can name this table rather than
          taking whichever .tscroll happens to come first. Adding a scroller
          above it silently repointed that assertion at a container narrow
          enough to fit, and the test then proved nothing at wide viewports. */}
      <div data-testid="wide-table">
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
      </div>

      <H>DataBoundary — missing data is reported, never faked</H>
      <DataBoundary screen="gallery">
        <Thrower />
      </DataBoundary>
      <div style={{ height: 40 }} />
    </main>
  );
}
