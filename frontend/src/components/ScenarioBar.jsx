import React from 'react';

export default function ScenarioBar({
  activeScenario,
  onSelectScenario,
  disabled = false,
}) {
  const tabs = [
    { id: 'inflight', label: '1. Active Run (Gated Approval)' },
    { id: 'settled', label: '2. Completed Run (Paid ₹8,900)' },
    { id: 'declined', label: '3. Operator Declined (Rohan Declined)' },
    { id: 'refusal', label: '4. Merchant 422 Over-Budget Refusal' },
    { id: 'idle', label: '5. Pre-Run Idle' },
  ];

  return (
    <section className="border-b border-outline pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
        <span className="text-xs uppercase tracking-widest text-on-surface-muted font-medium">
          Verified Evaluation Vectors
        </span>
        <span className="text-xs text-on-surface-muted">
          Interactive state demonstration for Buildathon evaluators (all states drive real backend)
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2" id="scenarioTabs">
        {tabs.map((tab) => {
          const isActive = activeScenario === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectScenario(tab.id)}
              className={`px-4 py-2 rounded text-xs tracking-wide transition-all border ${
                isActive
                  ? 'border-accent bg-accent text-background font-semibold shadow-sm'
                  : 'border-outline bg-surface text-on-surface-muted hover:text-on-surface hover:border-outline-strong font-medium disabled:opacity-50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
