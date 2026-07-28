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
  /** Current app state, read at call time — steps must not close over it. */
  getState: () => AppState;
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
  /**
   * The element a person would actually click to cause this step, resolved
   * against the live DOM. The tour animates a pointer to it and pulses before
   * running `run`, so the narration teaches WHERE the control is rather than
   * just narrating that something happened. Returning null (or omitting it)
   * skips straight to the action.
   *
   * A function, not a selector, because several of these need text matching:
   * the vendored edge rows carry no per-row test id, so the only way to pick
   * the edge pointing at a specific fact is by its rendered path.
   */
  clickTarget?: (frame: HTMLElement, t: BundleTour) => Element | null;
  run: (d: TourDeps) => void | Promise<void>;
}

/** Last path segment, which is what the vendored rows render. */
const leaf = (p: string) => p.split('/').pop() ?? p;

/** First descendant of `root` whose trimmed text is exactly `text`. */
function byExactText(root: ParentNode, sel: string, text: string): Element | null {
  return [...root.querySelectorAll(sel)]
    .find(e => e.children.length === 0 && e.textContent?.trim() === text) ?? null;
}

/** First descendant containing `needle`, preferring the deepest match. */
function byContains(root: ParentNode, sel: string, needle: string): Element | null {
  const hits = [...root.querySelectorAll(sel)].filter(e => e.textContent?.includes(needle));
  return hits.length ? hits[hits.length - 1] : null;
}

export function buildSteps(t: BundleTour): TourStep[] {
  return [
    {
      label: 'Chronological',
      body: 'The library opens in chronological order — most recently committed first. This is the view you want when you are asking what the knowledge base has learned lately.',
      highlight: 'library',
      // Only dispatch when the sort actually differs. SET_LIBRARY_SORT nulls
      // factPath by design — upstream clears the selection so the right panel
      // can't strand it in a view it doesn't belong to — so firing it as a
      // no-op "assert the default" closed whichever fact was open and dropped
      // the visitor onto the repo stats view the moment they started the tour.
      // The tour is restartable, so the sort still has to be corrected when it
      // genuinely isn't chronological; losing the selection is acceptable then,
      // because the view really is changing.
      run: ({ dispatch, getState }) => {
        if (getState().librarySort !== 'recent') {
          dispatch({ type: 'SET_LIBRARY_SORT', sort: 'recent' });
        }
      },
    },
    {
      label: 'Ontological',
      clickTarget: (f) => f.querySelector('[data-testid="sort-path"]'),
      body: 'The same corpus, organised instead by ontology — topic, then category, then the fact itself. Nothing was re-filed to produce this; the path is where the fact already lives in the repo.',
      highlight: 'library',
      run: ({ dispatch }) => dispatch({ type: 'SET_LIBRARY_SORT', sort: 'path' }),
    },
    {
      label: 'Facts are typed',
      clickTarget: (f) => f.querySelector('#filter-input'),
      body: 'Every fact carries a type. Filtering to synthesis leaves only the facts distilled from other facts — and the list switches to relevance order, because a filter is a query.',
      highlight: 'library',
      run: ({ dispatch }) => {
        dispatch({ type: 'SET_LIBRARY_SORT', sort: 'recent' });
        dispatch({ type: 'ADD_FILTER', chip: { category: 'type', value: 'synthesis' } });
      },
    },
    {
      label: 'Not a document',
      clickTarget: (f, t) => f.querySelector(`[data-path="${t.synthesis}"]`),
      body: 'A fact is one claim, with a confidence, a count of independent sources, and the domains and entities it touches. That is the whole record — there is no page around it.',
      highlight: 'fact',
      run: ({ navigate, tour }) => navigate({ view: 'library', factPath: tour.synthesis }),
    },
    {
      label: 'Built from',
      clickTarget: (f, t) => byContains(
        f.querySelector('[data-testid="edges-rail-slot"]') ?? f, 'div', leaf(t.target)),
      body: 'The connections rail lists what a synthesis was distilled from. We followed one — this is a fact it cites, and the rail now shows the synthesis among the facts referencing it.',
      highlight: 'edges',
      run: ({ tt, tour, headCommit }) => tt.hopEdge(tour.target, headCommit),
    },
    {
      label: 'Facts change',
      clickTarget: (f) => f.querySelector('[data-testid="version-walker"]')
        ?? f.querySelector('[data-testid="timeline-nav"]'),
      body: 'This one has been revised since it was written. Here it is at its first version — the body, the confidence, and the sources are all as they were then.',
      highlight: 'library',
      run: ({ tt, tour }) => tt.scrub(tour.targetVersions[0]),
    },
    {
      label: 'Both directions',
      clickTarget: (f, t) => byContains(
        f.querySelector('[data-testid="edges-rail-slot"]') ?? f, 'div', leaf(t.synthesis)),
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
      clickTarget: (f, t) => byExactText(f, 'span', t.entity),
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

type CursorState = { x: number; y: number; clicking: boolean } | null;

const TRAVEL_MS = 900;
const CLICK_MS = 320;
/** Keep the pointer this far inside the frame's edges. */
const EDGE_PAD = 16;

/**
 * Bring `el` into view by scrolling ONLY the scroll container it lives in.
 *
 * Not scrollIntoView: that walks every scrollable ancestor including the
 * document, so on a narrow viewport — where the frame is a scrolling column
 * and the page itself can scroll — it pushed the whole frame up and carried
 * the tour's own narration off screen. The visitor was left reading nothing
 * while the pointer moved.
 */
export function scrollWithin(root: HTMLElement, el: Element): void {
  let box: HTMLElement | null = el.parentElement;
  while (box && box !== root && box.scrollHeight <= box.clientHeight) box = box.parentElement;
  if (!box || box === root || box.scrollHeight <= box.clientHeight) return;
  const c = box.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  if (t.top >= c.top && t.bottom <= c.bottom) return;         // already visible
  box.scrollTop += (t.top < c.top)
    ? t.top - c.top - EDGE_PAD
    : t.bottom - c.bottom + EDGE_PAD;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useTour(deps: TourDeps | null, frameRef: { current: HTMLElement | null }) {
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

  // ── Simulated pointer ──────────────────────────────────────────────────
  // Advancing animates a pointer to the control that would perform the next
  // step, pulses it, and only then runs the action. Narrating that something
  // happened teaches nothing about where the control lives; showing the trip
  // does. Suppressed under prefers-reduced-motion, where the step just runs.
  const [cursor, setCursor] = useState<CursorState>(null);
  const [busy, setBusy] = useState(false);

  const advance = useCallback((n: number) => {
    void runStep(n);
    setIndex(n);
  }, [runStep]);

  const next = useCallback(() => {
    if (busy) return;                       // ignore clicks mid-flight
    const i = index;
    if (i === null) return;
    const n = i + 1;
    if (n >= steps.length) { stop(); return; }

    const d = depsRef.current;
    const frame = frameRef.current;
    const target = frame && d ? steps[n].clickTarget?.(frame, d.tour) ?? null : null;
    if (!target || reducedMotion()) { advance(n); return; }

    setBusy(true);
    // Bring the control on screen before measuring: animating to an element
    // scrolled out of the library's list would send the pointer off the frame.
    scrollWithin(frame!, target);

    // Two frames: one for the scroll above to apply, one to measure after it.
    // Measuring in the same frame reads the pre-scroll box, which on a narrow
    // viewport put the pointer below the frame entirely.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const box = frame!.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      // Clamp into the frame. `block: 'nearest'` does not guarantee the target
      // is fully visible — in the stacked mobile layout a row near the bottom
      // of a pane stays partly below the fold — and a pointer animating off
      // the edge reads as a glitch rather than as an instruction.
      const clamp = (v: number, max: number) => Math.max(EDGE_PAD, Math.min(max - EDGE_PAD, v));
      setCursor({
        x: clamp(t.left - box.left + Math.min(t.width / 2, 40), box.width),
        y: clamp(t.top - box.top + t.height / 2, box.height),
        clicking: false,
      });
      window.setTimeout(() => {
        setCursor(c => (c ? { ...c, clicking: true } : c));
        window.setTimeout(() => {
          advance(n);
          setCursor(null);
          setBusy(false);
        }, CLICK_MS);
      }, TRAVEL_MS);
    }));
  }, [busy, index, steps, stop, advance]);

  const dismissInvite = useCallback(() => { setInvite(false); markSeen(); }, []);

  return {
    steps, index, active, invite, cursor, busy,
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
  step, index, total, onNext, onStop, busy,
}: {
  step: TourStep; index: number; total: number;
  onNext: () => void; onStop: () => void; busy: boolean;
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
        <button
          type="button" className="explore-tour__next" data-testid="tour-next"
          onClick={last ? onStop : onNext} disabled={busy}
        >
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
export function TourLauncher({ onStart, repo, facts, commits }: {
  onStart: () => void; repo: string; facts: number; commits: number;
}) {
  // Both the label and the href come from the bundle's own `repo` field, so
  // retargeting KB_REPO_SLUG moves the link with it rather than leaving this
  // line confidently pointing at the wrong repository.
  const name = repo.split('/').pop() ?? repo;
  return (
    <div className="explore-tour explore-tour--launcher" data-testid="tour-launcher">
      <p className="explore-tour__body">
        You&rsquo;re browsing{' '}
        <a href={`https://github.com/${repo}`} rel="noopener" target="_blank">{name}</a>
        {' '}&mdash; {facts.toLocaleString()} facts, {commits.toLocaleString()} commits
        of history &mdash; in knomit&rsquo;s own web UI, served as a static snapshot.
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

/**
 * The simulated pointer. Purely decorative — aria-hidden and pointer-events
 * none, so it can never intercept a real click or reach a screen reader.
 */
export function TourCursor({ cursor }: { cursor: CursorState }) {
  if (!cursor) return null;
  return (
    <span
      className={`explore-tour-cursor${cursor.clicking ? ' is-clicking' : ''}`}
      style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
      data-testid="tour-cursor"
      aria-hidden="true"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 3l14 7.5-6.2 1.6L10 19z" fill="#fff" stroke="#111" strokeWidth="1.2"
              strokeLinejoin="round" />
      </svg>
    </span>
  );
}
