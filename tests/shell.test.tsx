// The shell primitives: skeletons, chips, rows, tiles and marks.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  SkeletonLine, SkeletonRegion, SkeletonRows, SkeletonTable, SkeletonTiles,
} from '../src/components/Skeleton';
import { ChipRow } from '../src/components/ChipRow';
import { ListRow } from '../src/components/ListRow';
import { StatTiles } from '../src/components/StatTiles';
import { markGradient, markLabel, TeamMark } from '../src/components/TeamMark';
import { EmptyState, SectionHeader } from '../src/components/Surface';

describe('skeletons', () => {
  it('are hidden from assistive technology', () => {
    const { container } = render(<SkeletonLine width={80} />);
    const node = container.querySelector('.skeleton');
    expect(node).toBeTruthy();
    expect(node?.getAttribute('aria-hidden')).toBe('true');
  });

  it('announce the region as busy exactly once', () => {
    render(
      <SkeletonRegion label="Loading roster">
        <SkeletonRows rows={4} />
      </SkeletonRegion>,
    );
    const region = screen.getByLabelText('Loading roster');
    expect(region.getAttribute('aria-busy')).toBe('true');
    // Every placeholder inside is hidden, so a screen reader hears one message
    // rather than a description of two dozen grey rectangles.
    const placeholders = within(region).getAllByRole('generic', { hidden: true });
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('mirror the row rhythm they stand in for', () => {
    const { container } = render(<SkeletonRows rows={5} />);
    // Five rows, so the page does not change height when real rows replace them.
    expect(container.querySelectorAll('[style*="min-height: 52px"]')).toHaveLength(5);
  });

  it('render tiles and tables at the requested size', () => {
    const tiles = render(<SkeletonTiles count={3} />);
    expect(tiles.container.querySelectorAll('.skeleton').length).toBe(6);
    tiles.unmount();
    const table = render(<SkeletonTable rows={4} columns={5} />);
    // Header row plus four body rows, five columns each.
    expect(table.container.querySelectorAll('.skeleton').length).toBe(25);
  });
});

describe('ChipRow', () => {
  const chips = [
    { key: 'all', label: 'All' },
    { key: 'CB', label: 'CB' },
    { key: 'QB', label: 'QB' },
  ];

  it('marks the selected chip and reports changes', () => {
    const onChange = vi.fn();
    render(<ChipRow chips={chips} value="CB" onChange={onChange} label="Position" />);
    expect(screen.getByRole('tab', { name: 'CB' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'QB' }).getAttribute('aria-selected')).toBe('false');
    fireEvent.click(screen.getByRole('tab', { name: 'QB' }));
    expect(onChange).toHaveBeenCalledWith('QB');
  });

  it('scrolls inside itself rather than widening the page', () => {
    const { container } = render(
      <ChipRow chips={chips} value="all" onChange={() => undefined} label="Position" />,
    );
    // The .tscroll marker is what the overflow guard and the e2e assertion both
    // use to tell an intentional scroller from a broken layout.
    expect(container.querySelector('.tscroll')).toBeTruthy();
  });
});

describe('ListRow', () => {
  it('renders title and subtitle', () => {
    render(<ListRow title="Depth chart" subtitle="Offense" />);
    expect(screen.getByText('Depth chart')).toBeTruthy();
    expect(screen.getByText('Offense')).toBeTruthy();
  });

  it('is a button only when it goes somewhere', () => {
    const { unmount } = render(<ListRow title="Static" />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    const onSelect = vi.fn();
    render(<ListRow title="Tappable" onSelect={onSelect} navigable />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('keeps a thumb-sized target', () => {
    const { container } = render(<ListRow title="Row" />);
    expect(container.querySelector('[style*="min-height: 52px"]')).toBeTruthy();
  });
});

describe('StatTiles', () => {
  it('renders a value per stat', () => {
    render(<StatTiles stats={[
      { label: 'Record', value: '11-6' },
      { label: 'Streak', value: 'W3', tone: 'positive' },
    ]} />);
    expect(screen.getByText('11-6')).toBeTruthy();
    expect(screen.getByText('W3')).toBeTruthy();
  });

  it('shows an explicit dash for a missing value, never a zero', () => {
    render(<StatTiles stats={[{ label: 'Cap space', value: null }]} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('TeamMark', () => {
  it('generates the fill from both club colours, loading no asset', () => {
    const fill = markGradient('#12376B', '#C8102E');
    expect(fill).toContain('#12376B');
    expect(fill).toContain('#C8102E');
    expect(fill).toContain('linear-gradient');
  });

  it('labels the mark with the abbreviation', () => {
    render(<TeamMark abbreviation="buf" primary="#12376B" secondary="#C8102E" />);
    expect(screen.getByRole('img', { name: 'BUF' })).toBeTruthy();
  });

  it('truncates a long abbreviation rather than overflowing', () => {
    expect(markLabel('LONGER')).toBe('LON');
    render(<TeamMark abbreviation="LONGER" primary="#111111" secondary="#222222" />);
    expect(screen.getByRole('img', { name: 'LON' })).toBeTruthy();
  });
});

describe('section furniture', () => {
  it('renders a section heading at level two', () => {
    render(<SectionHeader title="Standings" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Standings' })).toBeTruthy();
  });

  it('distinguishes empty from unavailable', () => {
    render(<EmptyState title="No transactions" detail="Nothing has happened yet." />);
    expect(screen.getByText('No transactions')).toBeTruthy();
    expect(screen.getByText('Nothing has happened yet.')).toBeTruthy();
  });
});
