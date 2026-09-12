import { Shell } from './app/Shell';
import { NavigationProvider } from './app/NavigationProvider';
import { TabBar, TABS } from './app/TabBar';
import { useEffect, type ReactNode } from 'react';
import { useNavigationState, useNavigator } from './app/navigation';
import { DEFAULT_SCREEN, HOME_SCREEN, isBootScreen, rootFor, screenFor } from './app/screens';
import { COLOR } from './app/tokens';
import { DevGallery } from './screens/DevGallery';
import { SaveProvider, useSave } from './app/SaveProvider';
import { Loading } from './components/QueryState';

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
  // Keyed on the screen so each navigation replays the fade rather than the
  // new screen appearing mid-animation of the old one.
  return <div key={screen} className="screen-in"><Component /></div>;
}

/** The shell, told whether a tab bar is going to be under it. */
function ShellForCurrentScreen({ children }: { readonly children: ReactNode }) {
  const { screen } = useNavigationState();
  return <Shell reserveNav={!isBootScreen(screen)}>{children}</Shell>;
}

function TabsForCurrentScreen() {
  const { screen } = useNavigationState();
  // The boot flow has no bottom navigation: there is nothing to navigate to
  // until a dynasty is open, and a bar of dead tabs under the main menu would
  // be five promises the app cannot keep.
  if (isBootScreen(screen)) return null;
  // A drill-down keeps its originating tab lit rather than clearing the bar,
  // so the bottom navigation never looks like it lost its place.
  const active = TABS.some((t) => t.key === screen) ? screen : '';
  return <TabBar active={active} />;
}

/**
 * Keeps the stack and the open save agreeing.
 *
 * One rule in one place, rather than a replaceRoot at every point that opens,
 * creates or closes a save: opening one leaves the boot flow, closing one
 * returns to it. Everything that changes which save is open -- the club list,
 * the slot list, the Office, a remembered save that turned out to be gone --
 * gets the right screen without knowing this rule exists.
 */
function OpenSaveRouter() {
  const { save, loaded } = useSave();
  const nav = useNavigator();
  const { screen } = useNavigationState();
  useEffect(() => {
    if (!loaded) return;
    const onBoot = isBootScreen(screen);
    if (save !== null && onBoot) nav.replaceRoot(DEFAULT_SCREEN);
    else if (save === null && !onBoot) nav.replaceRoot(HOME_SCREEN);
  }, [save, loaded, screen, nav]);
  return null;
}

/**
 * Where the app opens.
 *
 * The stack is created once, so this waits for the answer rather than starting
 * on Team and correcting itself: a frame pushed before the save is known would
 * leave a Back button pointing at a screen the player never saw. A remembered
 * save opens on the dashboard; anything else opens on the main menu, including
 * a first visit and a save that has since been deleted.
 */
function Booted() {
  const { save, loaded } = useSave();
  if (!loaded) {
    return (
      <Shell>
        <main style={{ padding: '24px 12px' }}>
          <Loading label="Loading Dynasty Manager" rows={3} />
        </main>
      </Shell>
    );
  }
  return (
    <NavigationProvider
      initialScreen={save === null ? HOME_SCREEN : DEFAULT_SCREEN}
      rootOf={rootFor}
    >
      <OpenSaveRouter />
      <ShellForCurrentScreen>
        <CurrentScreen />
      </ShellForCurrentScreen>
      <TabsForCurrentScreen />
    </NavigationProvider>
  );
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
    <SaveProvider>
      <Booted />
    </SaveProvider>
  );
}
