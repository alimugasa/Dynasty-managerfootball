import { useSave } from '../../app/SaveProvider';
import { useDepthChart } from '../../hooks/useDepthChart';
import { PrepCard } from '../playMatchup';

export function DepthPrep() {
  const { save, version } = useSave();
  const q = useDepthChart(save?.saveId, version);
  if (q.status !== 'ready') return <PrepCard label="Depth chart"
    value={q.status === 'error' ? 'Unavailable' : 'Loading…'}
    detail={q.status === 'error' ? q.error.message : 'Reading roster readiness'} tone="warn" />;
  const d = q.data;
  return <>
    <PrepCard label="Depth chart" value={!d.chartSaved ? 'Review order'
      : d.startersSet < d.startingPlaces ? 'Incomplete' : 'Starters set'}
      detail={String(d.startersSet) + ' of ' + String(d.startingPlaces) + ' starting places'}
      tone={d.chartSaved && d.startersSet === d.startingPlaces ? 'ready' : 'warn'} />
    <PrepCard label="Starter availability" value={d.injuredStarters === 0 ? 'Available' : String(d.injuredStarters) + ' injured'}
      detail="All starting slots checked" tone={d.injuredStarters === 0 ? 'ready' : 'warn'} />
  </>;
}
