import { useEffect, useRef, useState } from "react";

/**
 * Collapsible plain-language explainer card. Closed by default so experienced
 * users aren't slowed down; the summary line invites first-time readers in.
 */
export function HelpCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="help-card">
      <summary>💡 {title}</summary>
      <div className="help-body">{children}</div>
    </details>
  );
}

/**
 * Inline "ⓘ" toggle that reveals a short definition bubble. Click-based (not
 * hover-only) so it works on touch screens; closes on outside click.
 */
export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span className="help-tip" ref={ref}>
      <button
        type="button"
        aria-label="What does this mean?"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open && <span className="help-bubble" role="note">{text}</span>}
    </span>
  );
}
