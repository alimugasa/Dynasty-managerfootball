import { Shell } from './app/Shell';
import { DevGallery } from './screens/DevGallery';
import { COLOR } from './app/tokens';

/** Phase 1 has no screens and no navigation — both arrive in Phase 3. The only
 *  route is the component gallery, so the primitives can be inspected. */
export function App() {
  const gallery = window.location.pathname.startsWith('/dev/components');
  return (
    <Shell>
      {gallery ? (
        <DevGallery />
      ) : (
        <main style={{ padding: 20, color: COLOR.mut, fontSize: 14, lineHeight: 1.6 }}>
          <h1
            style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              color: COLOR.tx, fontSize: 26, margin: '0 0 8px',
            }}
          >
            DYNASTY MANAGER PRO
          </h1>
          <p style={{ margin: 0 }}>
            Phase 1 skeleton. No database connection, no screens, no navigation, no
            simulation. Open <code style={{ color: COLOR.amber }}>/dev/components</code> to
            inspect the primitives.
          </p>
        </main>
      )}
    </Shell>
  );
}
