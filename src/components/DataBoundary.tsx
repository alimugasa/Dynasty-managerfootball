import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isMissingData } from '../data/errors';
import { COLOR } from '../app/tokens';

interface Props { children: ReactNode; screen?: string }
interface State { error: Error | null }

/** Catches MissingData and reports what is missing. In development it names the
 *  table, column and id. In production it says the information is unavailable.
 *  It NEVER renders a fabricated value in either mode. */
export class DataBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[DataBoundary]', this.props.screen ?? '(unknown screen)', error, info);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const dev = import.meta.env.DEV;
    const missing = isMissingData(error);
    return (
      <div
        style={{
          padding: 14, borderRadius: 3, background: COLOR.panel,
          border: `1px solid ${missing ? COLOR.amber : COLOR.red}`, color: COLOR.tx,
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>
          {missing ? 'Information unavailable' : 'Something went wrong'}
        </p>
        {dev && (
          <pre style={{ margin: '8px 0 0', color: COLOR.mut, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {missing
              ? `table: ${error.table}\ncolumn: ${error.column ?? '(none)'}\nid: ${error.id ?? '(none)'}\nscreen: ${this.props.screen ?? error.screen ?? '(unknown)'}`
              : error.message}
          </pre>
        )}
      </div>
    );
  }
}
