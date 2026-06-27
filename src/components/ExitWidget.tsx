/**
 * Floating "return to the marketing site" widget for the full-bleed live demo.
 * It lives in the PARENT page (outside the iframe) so it always works. Anchored
 * bottom-right; collapsed to a single return-arrow, it expands on hover/focus to
 * reveal a terse label — the "feedback button" pattern.
 */
export default function ExitWidget() {
  return (
    <a href="/" className="exit-widget" aria-label="Back to knomit.io">
      <span className="exit-widget__label">knomit.io</span>
      <span className="exit-widget__icon" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 6 6v3" />
        </svg>
      </span>
      <style>{`
        .exit-widget {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          height: 46px;
          border-radius: 999px;
          background: rgba(20, 20, 20, 0.92);
          border: 1px solid #333;
          color: #eee;
          text-decoration: none;
          overflow: hidden;
          backdrop-filter: blur(8px);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7);
          font: 500 0.92rem/1 system-ui, -apple-system, sans-serif;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .exit-widget:hover,
        .exit-widget:focus-visible {
          border-color: #77cc99;
          transform: translateY(-1px);
          box-shadow: 0 12px 34px -10px rgba(0, 0, 0, 0.8);
        }
        .exit-widget__icon {
          flex: 0 0 46px;
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          color: #77cc99;
        }
        .exit-widget__label {
          max-width: 0;
          opacity: 0;
          white-space: nowrap;
          overflow: hidden;
          transition: max-width 0.28s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.18s ease, padding 0.28s ease;
        }
        .exit-widget:hover .exit-widget__label,
        .exit-widget:focus-visible .exit-widget__label {
          max-width: 160px;
          opacity: 1;
          padding-left: 16px;
        }
        @media (prefers-reduced-motion: reduce) {
          .exit-widget,
          .exit-widget__label {
            transition: none;
          }
        }
      `}</style>
    </a>
  );
}
