import React from 'react';

export default function FailuresHandledPanel({ onTriggerRefusalBypass, onTriggerDeclineDemo, isBypassing }) {
  return (
    <section className="bg-surface rounded-lg border border-outline p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
        <span className="text-on-surface-muted font-medium uppercase tracking-wider text-[11px]">
          Failures Handled Gracefully:
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-6 font-mono text-xs">
        <button
          type="button"
          disabled={isBypassing}
          onClick={onTriggerRefusalBypass}
          className="text-on-surface hover:text-accent flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          title="Directly calls POST /api/orders with an over-budget product without the agent, proving the server-side hard budget wall"
        >
          <span className="text-success font-sans">✓</span>
          <span>
            {isBypassing
              ? 'Testing Direct 422 Bypass...'
              : 'Verified: budget refusal (HTTP 422, REFUSAL direct bypass)'}
          </span>
          <span className="material-symbols-outlined text-xs text-on-surface-muted">
            open_in_new
          </span>
        </button>

        <span className="text-outline">·</span>

        <button
          type="button"
          onClick={onTriggerDeclineDemo}
          className="text-on-surface hover:text-accent flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Demonstrates clean stop when Rohan declines at the approval gate"
        >
          <span className="text-success font-sans">✓</span>
          <span>Verified: operator decline (clean stop, zero charge)</span>
          <span className="material-symbols-outlined text-xs text-on-surface-muted">
            open_in_new
          </span>
        </button>
      </div>
    </section>
  );
}
