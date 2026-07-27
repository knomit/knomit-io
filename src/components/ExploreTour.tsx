import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { AppState, Action } from '../generated/kb-ui/state';
import type { BundleTour } from '../lib/bundleTypes';

/**
 * A guided walk through one narrative in the knowledge base.
 *
 * It drives the real UI — every step dispatches into the same reducer the
 * panels use, or calls the same time-travel callbacks — rather than drawing a
 * mock-up over the top. So whatever the tour shows is genuinely what happens
 * when you click, and a step that broke would break the app too.
 *
 * The spine (which synthesis, which cited fact, which entity) is resolved at
 * BUILD time and carried in the bundle — see resolveTour in
 * scripts/build-kb-bundle.mjs. The KB rebuilds every three hours, so
 * hardcoding paths here would rot within days.
 */

/** What the tour can drive. Kept narrow so the steps stay declarative. */
export interface TourDeps {
  tour: BundleTour;
  headCommit: string;
  dispatch: Dispatch<Action>;
  navigate: (req: { view: 'library'; factPath: string | null }) => void;
  tt: {
    scrub: (commit: string) => void;
    hopEdge: (path: string, pinnedCommit: string) => Promise<void> | void;
    returnToNow: () => Promise<void> | void;
  };
}

export type HighlightKey = 'library' | 'fact' | 'edges' | 'filter';

export interface TourStep {
  /** Short label for the progress readout. */
  label: string;
  /** One or two sentences. The argument the step is making, not a caption. */
  body: string;
  /**
   * Which element to ring, as a KEY not a selector. explore.astro maps keys
   * to selectors in CSS, so the ring is declarative: adding a filter chip
   * re-renders FilterBar and would wipe a class applied to its DOM node,
   * but an attribute on the frame survives any re-render beneath it.
   */
  highlight?: HighlightKey;
  run: (d: TourDeps) => void | Promise<void>;
}

export function buildSteps(t: BundleTour): TourStep[] {
  return [
    {
      label: 'Two lenses',
      body: 'The library lists facts newest-first. The tree organises the same corpus by ontology — topic, then category. Same facts, two ways in.',
      highlight: 'library',
      run: ({ dispatch }) => dispatch({ type: 'SET_LIBRARY_SORT', sort: 'path' }),
    },
    {
      label: 'Facts are typed',
      body: 'Every fact carries a type. Filtering to synthesis leaves only the facts distilled from other facts — and the list switches to relevance order, because a filter is a query.',
      highlight: 'library',
      run: ({ dispatch }) => {
        dispatch({ type: 'SET_LIBRARY_SORT', sort: 'recent' });
        dispatch({ type: 'ADD_FILTER', chip: { category: 'type', value: 'synthesis' } });
      },
    },
    {
      label: 'Not a document',
      body: 'A fact is one claim, with a confidence, a count of independent sources, and the domains and entities it touches. That is the whole record — there is no page around it.',
      highlight: 'fact',
      run: ({ navigate, tour }) => navigate({ view: 'library', factPath: tour.synthesis }),
    },
    {
      label: 'Built from',
      body: 'The connections rail lists what a synthesis was distilled from. We followed one — this is a fact it cites, and the rail now shows the synthesis among the facts referencing it.',
      highlight: 'edges',
      run: ({ tt, tour, headCommit }) => tt.hopEdge(tour.target, headCommit),
    },
    {
      label: 'Facts change',
      body: 'This one has been revised since it was written. Here it is at its first version — the body, the confidence, and the sources are all as they were then.',
      highlight: 'library',
      run: ({ tt, tour }) => tt.scrub(tour.targetVersions[0]),
    },
    {
      label: 'Both directions',
      body: 'Back up the edge you came down — the same connection read the other way — and back to now. Citations resolve in both directions, so you can ask what a fact rests on and what rests on it.',
      highlight: 'edges',
      run: async ({ tt, tour, headCommit, dispatch }) => {
        await tt.hopEdge(tour.synthesis, headCommit);
        // Return to live with a plain dispatch rather than tt.returnToNow().
        // useTimeTravel syncs its state ref in a useEffect, so a tt call made
        // immediately after another one still reads the PREVIOUS anchor and
        // re-pins to history — which left the next step filtering inside a
        // time-travel excursion, where FilterBar renders the trail breadcrumb
        // and #filter-input does not exist at all.
        dispatch({ type: 'SET_AS_OF', asOf: { mode: 'live' } });
      },
    },
    {
      label: 'Any value is a query',
      body: `Entities and domains are not tags for decoration. Clicking ${'“'}${t.entity}${'”'} filters the whole corpus to every fact that mentions it.`,
      highlight: 'filter',
      run: ({ dispatch, tour }) => {
        // Belt and braces: the filter bar only renders its input while live.
        dispatch({ type: 'SET_AS_OF', asOf: { mode: 'live' } });
        dispatch({ type: 'ADD_FILTER', chip: { category: 'entity', value: tour.entity } });
      },
    },
  ];
}

const SEEN_KEY = 'knomit.explore.tourSeen';

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* disabled / quota */ }
}
function hasSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}

export function useTour(deps: TourDeps | null) {
  const [index, setIndex] = useState<number | null>(null);
  const [invite, setInvite] = useState(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const steps = useMemo(() => (deps ? buildSteps(deps.tour) : []), [deps?.tour]);
  const active = index !== null;

  // First visit only, and only once the bundle has actually loaded — an
  // invitation to tour a thing that isn't on screen yet reads as noise.
  useEffect(() => {
    if (deps && !hasSeen()) setInvite(true);
  }, [!!deps]);

  const runStep = useCallback(async (i: number) => {
    const d = depsRef.current;
    if (!d || !steps[i]) return;
    await steps[i].run(d);
  }, [steps]);

  const start = useCallback(() => {
    setInvite(false);
    markSeen();
    setIndex(0);
    void runStep(0);
  }, [runStep]);

  const stop = useCallback(() => {
    setIndex(null);
    setInvite(false);
    markSeen();
    const d = depsRef.current;
    if (!d) return;
    // Leave the app in a clean state rather than wherever the last step
    // parked it: the point of the ending is "you're back at the library".
    void (async () => {
      await d.tt.returnToNow();
      d.dispatch({ type: 'CLEAR_FILTERS' });
      d.navigate({ view: 'library', factPath: null });
      d.dispatch({ type: 'SET_LIBRARY_SORT', sort: 'recent' });
    })();
  }, []);

  const next = useCallback(() => {
    setIndex(i => {
      if (i === null) return i;
      const n = i + 1;
      if (n >= steps.length) { queueMicrotask(stop); return i; }
      void runStep(n);
      return n;
    });
  }, [steps.length, runStep, stop]);

  const dismissInvite = useCallback(() => { setInvite(false); markSeen(); }, []);

  return {
    steps, index, active, invite,
    step: index === null ? null : steps[index],
    start, next, stop, dismissInvite,
  };
}

/**
 * The narration bar. Pinned above the filter bar so it never occludes the
 * thing it is describing — which anchored callouts would, especially in the
 * stacked mobile layout where the panes are already competing for height.
 */
export function TourBar({
  step, index, total, onNext, onStop,
}: {
  step: TourStep; index: number; total: number;
  onNext: () => void; onStop: () => void;
}) {
  const last = index === total - 1;
  return (
    <div className="explore-tour" data-testid="tour-bar" role="region" aria-label="Guided tour">
      <div className="explore-tour__meta">
        <span className="explore-tour__count">{index + 1}/{total}</span>
        <span className="explore-tour__label">{step.label}</span>
      </div>
      <p className="explore-tour__body">{step.body}</p>
      <div className="explore-tour__actions">
        <button type="button" className="explore-tour__skip" onClick={onStop} data-testid="tour-skip">
          {last ? 'Close' : 'Skip'}
        </button>
        <button type="button" className="explore-tour__next" onClick={last ? onStop : onNext} data-testid="tour-next">
          {last ? 'Done' : 'Next'}
        </button>
      </div>
    </div>
  );
}

/**
 * Permanent way back in. Without it the tour is a one-shot: dismissed on the
 * first visit and then unreachable forever, which makes it useless to anyone
 * who declines it once and later wonders what this page is. One slim row.
 */
export function TourLauncher({ onStart, facts, commits }: {
  onStart: () => void; facts: number; commits: number;
}) {
  return (
    <div className="explore-tour explore-tour--launcher" data-testid="tour-launcher">
      <p className="explore-tour__body">
        You are browsing a real knomit knowledge base — {facts.toLocaleString()} facts
        across {commits.toLocaleString()} commits of history, served from a static
        snapshot. Nothing here is a mock-up.
      </p>
      <div className="explore-tour__actions">
        <button type="button" className="explore-tour__next" onClick={onStart} data-testid="tour-start">
          Take the tour
        </button>
      </div>
    </div>
  );
}

/** First-visit invitation. One line, dismissible, never shown twice. */
export function TourInvite({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="explore-tour explore-tour--invite" data-testid="tour-invite">
      <p className="explore-tour__body">
        New to knomit? A short tour walks one fact through provenance, history and search.
      </p>
      <div className="explore-tour__actions">
        <button type="button" className="explore-tour__skip" onClick={onDismiss} data-testid="tour-dismiss">
          No thanks
        </button>
        <button type="button" className="explore-tour__next" onClick={onStart} data-testid="tour-start">
          Take the tour
        </button>
      </div>
    </div>
  );
}
