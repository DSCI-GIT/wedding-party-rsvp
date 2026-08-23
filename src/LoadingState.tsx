export function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`loading-state${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
    <div className="loading-boxes" aria-hidden="true"><span /><span /><span /></div>
    <p>{label}</p>
  </div>;
}