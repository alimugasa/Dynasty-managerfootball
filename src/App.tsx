import { Shell } from './app/Shell';
import { NavigationProvider } from './app/NavigationProvider';
import { TabBar, TABS } from './app/TabBar';
import { useNavigationState } from './app/navigation';
import { DEFAULT_SCREEN, rootFor, screenFor } from './app/screens';
import { COLOR } from './app/tokens';
import { DevGallery } from './screens/DevGallery';
import { GameProvider } from './game/GameProvider';

/** Resolves the frame on top of the stack to a screen and renders it. */
function CurrentScreen() {
  const { screen } = useNavigationState();
  const def = screenFor(screen);

  if (def === undefined) {
    // An unregistered screen is a routing defect, and it says so rather than
    // rendering something plausible. ARCHITECTURE.md rule 3 applies to routes
    // as much as to data.
    return (
      <main style={{ padding: 20, color: COLOR.mut, fontSize: 14, lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: COLOR.tx }}>No screen registered for “{screen}”.</p>
        <p style={{ margin: '8px 0 0' }}>
          Add it to <code style={{ color: COLOR.amber }}>src/app/screens.ts</code>.
        </p>
      </main>
    );
  }

  const { Component } = def;
  return <Component />;
}

function TabsForCurrentScreen() {
  const { screen } = useNavigationState();
  // A drill-down keeps its originating tab lit rather than clearing the bar,
  // so the bottom navigation never looks like it lost its place.
  const active = TABS.some((t) => t.key === screen) ? screen : '';
  return <TabBar active={active} />;
}

export function App() {
  // The component gallery is a development surface, not a destination in the
  // app, so it sits outside the navigation stack entirely.
  const gallery = typeof window !== 'undefined'
    && window.location.pathname.startsWith('/dev/components');

  if (gallery) {
    return (
      <Shell>
        <DevGallery />
      </Shell>
    );
  }

  return (
    <GameProvider>
      <NavigationProvider initialScreen={DEFAULT_SCREEN} rootOf={rootFor}>
        <Shell>
          <CurrentScreen />
        </Shell>
        <TabsForCurrentScreen />
      </NavigationProvider>
    </GameProvider>
  );
}
