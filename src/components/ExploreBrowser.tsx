import { useReducer, useEffect, useState, useRef, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BUNDLE_URL } from '../generated/kb-bundle-url';
import { setBundle, assertSchema } from '../lib/bundleApi';
import type { Bundle } from '../lib/bundleTypes';
import {
  reducer, init, isLive, edgeAnchorCommit, factHistoryAnchor, selectTrail,
} from '../generated/kb-ui/state';
import { LeftPanel } from '../generated/kb-ui/LeftPanel';
import { RightPanel } from '../generated/kb-ui/RightPanel';
import { EdgesRail } from '../generated/kb-ui/EdgesRail';
import { FilterBar } from '../generated/kb-ui/FilterBar';
import { ErrorBoundary } from '../generated/kb-ui/ErrorBoundary';
import { useNavigationManager } from '../generated/kb-ui/useNavigationManager';
import { useTimeTravel } from '../generated/kb-ui/useTimeTravel';

const EDGES_RAIL_SLOT: CSSProperties = { width: 300, flexShrink: 0, display: 'flex', minHeight: 0 };
const LEFT_WIDTH = 340;

type Load = { phase: 'loading' } | { phase: 'ready'; bundle: Bundle } | { phase: 'failed' };

export default function ExploreBrowser() {
  const [load, setLoad] = useState<Load>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(BUNDLE_URL)
      .then(r => { if (!r.ok) throw new Error(`${BUNDLE_URL} -> ${r.status}`); return r.json(); })
      .then((b: Bundle) => {
        assertSchema(b);
        if (cancelled) return;
        setBundle(b);
        setLoad({ phase: 'ready', bundle: b });
      })
      .catch(err => {
        console.warn('[explore] bundle unavailable:', err);
        if (!cancelled) setLoad({ phase: 'failed' });
      });
    return () => { cancelled = true; };
  }, []);

  if (load.phase === 'loading') return <Placeholder>Loading the knowledge base…</Placeholder>;
  // The page keeps its teaser markup below; signalling failure lets it show.
  if (load.phase === 'failed') return <Fallback />;
  return <Browser bundle={load.bundle} />;
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div data-testid="explore-placeholder" style={{
      display: 'grid', placeItems: 'center', height: '100%',
      color: 'var(--k-text-2)', fontFamily: 'var(--k-font-mono)', fontSize: 13,
    }}>{children}</div>
  );
}

function Fallback() {
  useEffect(() => {
    document.body.classList.add('explore-fallback');
    return () => { document.body.classList.remove('explore-fallback'); };
  }, []);
  return (
    <Placeholder>
      <span data-testid="explore-fallback">
        The live knowledge base could not be loaded right now.
      </span>
    </Placeholder>
  );
}

function Browser({ bundle }: { bundle: Bundle }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...init,
    repo: bundle.repo,
    branch: bundle.ref,
    headCommit: bundle.head,
    ontologyRoot: 'kb',
    // Drives isReadOnly(), which the vendored panels already honour — this is
    // how every write affordance disappears without forking a component.
    serverReadOnly: true,
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const { navigate } = useNavigationManager(state, dispatch);
  const tt = useTimeTravel(state, dispatch);
  const frameRef = useRef<HTMLDivElement>(null);

  const jumpTrail = useCallback((i: number) => {
    const depth = selectTrail(stateRef.current).length - 1;
    for (let k = 0; k < depth - i; k++) dispatch({ type: 'NAV_BACK' });
  }, [dispatch]);

  // Scoped to the frame, not window: the page has site chrome around it.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '/') { e.preventDefault(); document.getElementById('filter-input')?.focus(); return; }
      if (e.key === 'Escape') {
        if (!isLive(stateRef.current)) tt.returnToNow();
        else dispatch({ type: 'CLEAR_FILTERS' });
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); dispatch({ type: 'NAV_BACK' }); return; }
      if (e.key === 'h') { e.preventDefault(); tt.returnToNow(); }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [tt, dispatch]);

  const edge = factHistoryAnchor(state);

  return (
    <div
      ref={frameRef}
      tabIndex={-1}
      data-testid="explore-browser"
      style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden', outline: 'none' }}
    >
      <div style={{ width: LEFT_WIDTH, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ErrorBoundary variant="inline" label="The library hit an error">
          <LeftPanel
            state={state} dispatch={dispatch} navigate={navigate}
            onScrub={tt.scrub} onOpenFileAt={tt.openFileAt} onReturnToLive={tt.returnToNow}
          />
        </ErrorBoundary>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid #222' }}>
        <ErrorBoundary variant="inline" label="The filter bar hit an error">
          <FilterBar state={state} dispatch={dispatch} onJumpTrail={jumpTrail} />
        </ErrorBoundary>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <ErrorBoundary variant="inline" label="This fact could not be displayed">
              <RightPanel state={state} dispatch={dispatch} onScrub={tt.scrub} onHopRef={tt.hopEdge} />
            </ErrorBoundary>
          </div>
          {state.factPath && (
            /* Our own wrapper, so the E2E spec has a stable hook without
               adding a test id to a vendored component. */
            <div style={EDGES_RAIL_SLOT} data-testid="edges-rail-slot">
              <ErrorBoundary variant="inline" label="Connections could not be displayed">
                <EdgesRail
                  repo={edge.repo} branch={edge.branch} factPath={edge.path}
                  anchorCommit={edgeAnchorCommit(state)} history={!isLive(state)}
                  onHop={tt.hopEdge}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
