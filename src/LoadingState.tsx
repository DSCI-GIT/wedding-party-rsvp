import { createPortal } from "react-dom";

export function LoadingState({ label, detail = "This can take a few seconds. Your page is still working.", compact = false }: { label: string; detail?: string; compact?: boolean }) {
  const content = <div className={`loading-state${compact ? " is-compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
    <div className="loading-invitation" aria-hidden="true"><div className="loading-rings"><span /><span /></div><div className="loading-envelope"><i /></div></div>
    <div><p>{label}</p><small>{detail}</small></div>
  </div>;
  return compact ? content : createPortal(content, document.body);
}
