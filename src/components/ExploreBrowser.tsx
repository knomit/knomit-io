import { useReducer, useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
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
import { useTour, TourBar, TourInvite, TourLauncher } from './ExploreTour';

// Library | content splitter. Mirrors upstream App.tsx's own constants (see
// its LEFT_PANEL_MIN/MAX_FRACTION/DEFAULT_FRACTION) so the drag feels like the
// real product — this is App-local layout code, not vendored, so it's ours to
// carry over. One deliberate difference: upstream clamps against
// window.innerWidth because it owns the whole viewport; this frame is boxed
// inside the site's container, so clamping uses the FRAME's own clientWidth
// instead (window.innerWidth would let the pane grow wider than the box it
// lives in on a wide desktop where the container is narrower than the
// viewport).
const LEFT_PANEL_MIN = 180;
const LEFT_PANEL_MAX_FRACTION = 0.6;
const LEFT_PANEL_DEFAULT_FRACTION = 0.24;
const LEFT_PANEL_FALLBACK = 340; // used only until the frame's width is measured
const LEFT_PANEL_STORAGE_KEY = 'knomit.explore.leftPanelWidth';

// Connections rail. Upstream has no splitter here — its rail is a fixed 300px
// column — but full-bleed makes that ratio wrong: at 1600px a fixed rail plus a
// fractional library squeezed the fact panel to roughly the same width as both
// neighbours, so the page read as three equal columns with the actual content
// no better off than its chrome. The rail is now draggable on the same terms as
// the library. The vendored root's inline `width: 300` is overridden from
// explore.astro's stylesheet, not by editing the component.
const RAIL_MIN = 220;
const RAIL_MAX_FRACTION = 0.4;
const RAIL_DEFAULT = 320;
const RAIL_STORAGE_KEY = 'knomit.explore.railWidth';

/** Scroll targets for the tour's highlight keys. The ring is drawn in CSS. */
const HIGHLIGHT_SELECTOR: Record<string, string> = {
  library: '[data-testid="library-header"]',
  fact: '[data-testid="fact-title"]',
  edges: '[data-testid="edges-rail-slot"]',
  filter: '#filter-input',
};

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clampLeftPanelWidth(px: number, containerWidth: number): number {
  const max = Math.max(LEFT_PANEL_MIN, Math.floor(containerWidth * LEFT_PANEL_MAX_FRACTION));
  return Math.max(LEFT_PANEL_MIN, Math.min(max, Math.round(px)));
}

function clampRailWidth(px: number, containerWidth: number): number {
  const max = Math.max(RAIL_MIN, Math.floor(containerWidth * RAIL_MAX_FRACTION));
  return Math.max(RAIL_MIN, Math.min(max, Math.round(px)));
}

function readStoredWidth(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

type Load = { phase: 'loading' } | { phase: 'ready'; bundle: Bundle } | { phase: 'failed' };

export default function ExploreBrowser() {
  const [load, setLoad] = useState<Load>({ phase: 'loading' });

  // The frame is sized `calc(100dvh - var(--k-header-h))`. The fallback in the
  // stylesheet is today's 61px, but the header's height is intrinsic — padding
  // plus content — so an extra nav item that wraps, or a font change, would
  // silently leave a gap or push the footer off. Measure the real header and
  // keep the variable honest.
  useLayoutEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const apply = () => {
      document.documentElement.style.setProperty(
        '--k-header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(header);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--k-header-h');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(BUNDLE_URL, { signal: AbortSignal.timeout(15_000) })
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
    // NOT serverReadOnly. It looks like the right switch — isReadOnly() feeds
    // the vendored panels and hides every write affordance — but upstream
    // overloads that flag: FactBody gates its domain/entity/origin chips on
    // the same boolean (`if (!readOnly) onTagClick(name)`, FactBody.tsx:163),
    // so setting it also kills click-to-filter, which is a READ feature and
    // one of the better things about the UI.
    //
    // The write surface it was buying us is small: the retract button, and
    // FactEditor, which only renders for a fact with a parse_error. Those are
    // hidden from this page's stylesheet instead (see explore.astro), and
    // bundleApi's updateFact/retractFact throw regardless — the API, not the
    // CSS, is the real guarantee. Leaving this false also means time-travel
    // still disables editing on its own, via isReadOnly's `|| !isLive(s)`,
    // exactly as upstream intends.
    serverReadOnly: false,
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const { navigate } = useNavigationManager(state, dispatch);
  const tt = useTimeTravel(state, dispatch);
  const frameRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

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

  // Library | content splitter — desktop only (hidden below the site's 860px
  // breakpoint via CSS; see explore.astro). Measured against the FRAME's own
  // width, not the window's — see the constants comment above.
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(LEFT_PANEL_FALLBACK);
  const [railWidth, setRailWidth] = useState<number>(RAIL_DEFAULT);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    const storedLeft = readStoredWidth(LEFT_PANEL_STORAGE_KEY);
    setLeftPanelWidth(clampLeftPanelWidth(
      storedLeft ?? Math.round(containerWidth * LEFT_PANEL_DEFAULT_FRACTION), containerWidth));
    setRailWidth(clampRailWidth(readStoredWidth(RAIL_STORAGE_KEY) ?? RAIL_DEFAULT, containerWidth));
    // Run once on mount, after the frame has its real layout width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onResize = () => {
      const el = frameRef.current;
      if (!el) return;
      setLeftPanelWidth(w => clampLeftPanelWidth(w, el.clientWidth));
      setRailWidth(w => clampRailWidth(w, el.clientWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Dragging the rail's splitter moves its LEFT edge, so a rightward drag
  // shrinks it — the opposite sign to the library's.
  const startRailDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = frameRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    const startX = e.clientX;
    const startWidth = railWidth;
    const onMove = (ev: MouseEvent) => {
      setRailWidth(clampRailWidth(startWidth - (ev.clientX - startX), containerWidth));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setRailWidth(w => {
        try { localStorage.setItem(RAIL_STORAGE_KEY, String(w)); } catch { /* quota / disabled */ }
        return w;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const startSplitterDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = frameRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    const startX = e.clientX;
    const startWidth = leftPanelWidth;
    const onMove = (ev: MouseEvent) => {
      setLeftPanelWidth(clampLeftPanelWidth(startWidth + (ev.clientX - startX), containerWidth));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setLeftPanelWidth(w => {
        try { localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(w)); } catch { /* quota / disabled */ }
        return w;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Guided tour ────────────────────────────────────────────────────────
  // Driven entirely through the same dispatch/navigate/tt the panels use, so
  // it can't drift from what a real click does. `bundle.tour` is resolved at
  // build time and may be absent, in which case nothing here renders.
  const tourDeps = useMemo(
    () => (bundle.tour
      ? { tour: bundle.tour, headCommit: bundle.head, dispatch, navigate, tt }
      : null),
    [bundle.tour, bundle.head, dispatch, navigate, tt],
  );
  const tour = useTour(tourDeps);

  // Retarget the highlight ring each step. The ring itself is CSS keyed off
  // `data-tour-highlight` on the frame (see explore.astro) rather than a class
  // on the target: a step that dispatches a filter re-renders FilterBar, and a
  // class applied to its DOM node is wiped by that re-render — which silently
  // cost the last step its highlight. An attribute on the ancestor cannot be.
  // The only imperative part left is scrolling the target into view, which the
  // stacked mobile layout needs.
  useEffect(() => {
    const key = tour.step?.highlight;
    if (!key) return;
    const sel = HIGHLIGHT_SELECTOR[key];
    // Let the step's own dispatch land — the rail only exists once a fact is
    // open, and the filter input only while the anchor is live.
    const id = window.setTimeout(() => {
      frameRef.current?.querySelector(sel)?.scrollIntoView({
        block: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }, 80);
    return () => window.clearTimeout(id);
  }, [tour.step]);

  // On a narrow viewport the library and the fact panel stack (see
  // explore.astro's @media rule); scroll the fact panel into view when a fact
  // opens so tapping a row deep in a long list doesn't strand the visitor
  // scrolled past it, looking at an unchanged list. Skip the very first
  // factPath change, though: Library.tsx auto-opens the first fact on mount
  // (its own AMEND_NAV), and that isn't a tap the visitor made — scrolling
  // for it strands a first-time phone visitor past the header and library,
  // looking at one fact with no way to tell what page they're even on.
  const isFirstFactPath = useRef(true);
  useEffect(() => {
    if (!state.factPath) return;
    if (isFirstFactPath.current) { isFirstFactPath.current = false; return; }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(max-width: 860px)').matches) return;
    mainRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  }, [state.factPath]);

  const edge = factHistoryAnchor(state);

  return (
    <div
      ref={frameRef}
      tabIndex={-1}
      data-testid="explore-browser"
      data-tour-highlight={tour.step?.highlight ?? undefined}
      className="explore-frame"
    >
      <div className="explore-frame__left" style={{ width: leftPanelWidth }}>
        <ErrorBoundary variant="inline" label="The library hit an error">
          <LeftPanel
            state={state} dispatch={dispatch} navigate={navigate}
            onScrub={tt.scrub} onOpenFileAt={tt.openFileAt} onReturnToLive={tt.returnToNow}
          />
        </ErrorBoundary>
      </div>
      {/* Drag handle, desktop only. 4px visible separator + 8px hit zone via
          negative margins on either side, matching upstream's own splitter. */}
      <div
        className="explore-frame__splitter"
        data-testid="library-splitter"
        onMouseDown={startSplitterDrag}
        title="Drag to resize"
      />
      <div className="explore-frame__main" ref={mainRef}>
        {tour.active && tour.step && (
          <TourBar
            step={tour.step} index={tour.index!} total={tour.steps.length}
            onNext={tour.next} onStop={tour.stop}
          />
        )}
        {!tour.active && tour.invite && (
          <TourInvite onStart={tour.start} onDismiss={tour.dismissInvite} />
        )}
        {!tour.active && !tour.invite && tourDeps && (
          <TourLauncher onStart={tour.start} />
        )}
        <ErrorBoundary variant="inline" label="The filter bar hit an error">
          <FilterBar state={state} dispatch={dispatch} onJumpTrail={jumpTrail} />
        </ErrorBoundary>
        <div className="explore-frame__body">
          <div className="explore-frame__content">
            <ErrorBoundary variant="inline" label="This fact could not be displayed">
              <RightPanel state={state} dispatch={dispatch} onScrub={tt.scrub} onHopRef={tt.hopEdge} />
            </ErrorBoundary>
          </div>
          {state.factPath && (
            <>
              <div
                className="explore-frame__splitter explore-frame__splitter--rail"
                data-testid="rail-splitter"
                onMouseDown={startRailDrag}
                title="Drag to resize"
              />
              {/* Our own wrapper, so the E2E spec has a stable hook without
                  adding a test id to a vendored component. Its width also
                  drives the vendored rail, via the `> *` override in
                  explore.astro. */}
              <div
                className="explore-frame__rail"
                data-testid="edges-rail-slot"
                style={{ width: railWidth }}
              >
                <ErrorBoundary variant="inline" label="Connections could not be displayed">
                  <EdgesRail
                    repo={edge.repo} branch={edge.branch} factPath={edge.path}
                    anchorCommit={edgeAnchorCommit(state)} history={!isLive(state)}
                    onHop={tt.hopEdge}
                  />
                </ErrorBoundary>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
