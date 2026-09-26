import { useEffect, useState } from "react";

export type DemoTab = "dispatch" | "client" | "roster";

export type TourStep = {
  tab: DemoTab;
  title: string;
  body: string;
  find: () => HTMLElement | null;
  /** Runs shortly after the step is shown (e.g. open a dialog). */
  onEnter?: () => void;
  /** Runs when leaving the step or closing the tour (e.g. close that dialog). */
  onLeave?: () => void;
  cardAtTop?: boolean;
};

const CARD_WIDTH = 340;

// Spotlight tour: dims the page except the target, and shows a card. The page
// underneath stays clickable so guests can try each step as they go.
export function DemoTour({
  steps,
  tab,
  setTab,
  onClose,
}: {
  steps: TourStep[];
  tab: DemoTab;
  setTab: (tab: DemoTab) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  useEffect(() => {
    if (step.tab !== tab) setTab(step.tab);
  }, [step, tab, setTab]);

  useEffect(() => {
    if (step.tab !== tab) return;
    const timer = window.setTimeout(() => step.onEnter?.(), 150);
    return () => {
      window.clearTimeout(timer);
      step.onLeave?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, tab]);

  useEffect(() => {
    if (step.tab !== tab) return;
    let cancelled = false;
    let frame = 0;
    let scrolled = false;
    let attempts = 0;
    const track = () => {
      if (cancelled) return;
      const el = step.find();
      if (el) {
        if (!scrolled) {
          scrolled = true;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setRect(el.getBoundingClientRect());
      } else if (attempts++ > 60) {
        setRect(null);
      }
      frame = requestAnimationFrame(track);
    };
    setRect(null);
    frame = requestAnimationFrame(track);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [step, tab]);

  const last = index === steps.length - 1;
  const pad = 6;
  const cardLeft = rect && rect.left + rect.width / 2 > window.innerWidth / 2 ? 24 : window.innerWidth - CARD_WIDTH - 24;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {rect ? (
        <div
          className="absolute rounded-lg border-2 border-crm-warning transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}
      <div
        className={`pointer-events-auto absolute ${step.cardAtTop ? "top-6" : "bottom-6"} rounded-xl border border-crm-hairline bg-crm-canvas p-4 shadow-2xl`}
        style={{ width: Math.min(CARD_WIDTH, window.innerWidth - 32), left: Math.max(16, Math.min(cardLeft, window.innerWidth - CARD_WIDTH - 16)) }}
        role="dialog"
        aria-label="Demo guide"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-crm-warning">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-sm font-bold text-crm-ink">{step.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-crm-body">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="text-[11px] font-bold text-crm-muted hover:text-crm-ink">
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={() => setIndex(index - 1)} className="rounded border border-crm-hairline px-3 py-1.5 text-xs font-bold text-crm-ink hover:border-crm-ink">
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : setIndex(index + 1))}
              className="rounded bg-crm-primary px-4 py-1.5 text-xs font-bold text-crm-on-primary"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
