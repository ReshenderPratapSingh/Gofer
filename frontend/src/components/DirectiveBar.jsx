import React, { useState, useEffect } from 'react';

export default function DirectiveBar({
  directive,
  setDirective,
  onSend,
  isLoading,
  config,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempInput, setTempInput] = useState(directive);

  useEffect(() => {
    setTempInput(directive);
  }, [directive]);

  const maxBudgetPaise = config?.maxBudgetPaise || 900000;
  const hardCapRupees = (maxBudgetPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const hardCapPaiseFormatted = maxBudgetPaise.toLocaleString('en-IN');
  const storeName = config?.storeName || "Meera’s Store";

  const handleApply = (e) => {
    e.preventDefault();
    if (tempInput.trim()) {
      setDirective(tempInput.trim());
      setIsEditing(false);
      onSend(tempInput.trim());
    }
  };

  return (
    <section className="bg-surface rounded-lg border border-outline p-6 space-y-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            <span className="text-xs uppercase tracking-wider text-on-surface-muted font-medium">
              Natural Language Procurement Directive
            </span>
          </div>
          <h2 className="font-serif text-2xl text-on-surface tracking-tight" id="activePromptHeading">
            "{directive}"
          </h2>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            disabled={isLoading}
            className="px-3 py-2 rounded border border-outline text-xs text-on-surface-muted hover:text-on-surface hover:border-outline-strong transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            <span>Edit Intent</span>
          </button>
          <button
            type="button"
            onClick={() => onSend(directive)}
            disabled={isLoading}
            className="px-5 py-2 rounded bg-accent hover:bg-[#bfa068] text-background font-medium text-xs tracking-wide transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-background border-t-transparent rounded-full animate-spin"></span>
                <span>Gofer Active...</span>
              </>
            ) : (
              <>
                <span>Send to Gofer</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editable input drawer */}
      {isEditing && (
        <form onSubmit={handleApply} className="pt-4 border-t border-outline">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={tempInput}
              onChange={(e) => setTempInput(e.target.value)}
              placeholder="e.g. get me an ergonomic study chair under ₹9,000, delivered this week"
              className="flex-1 bg-surface-low border border-outline rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-accent font-sans"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-accent text-background rounded text-xs font-semibold hover:bg-[#bfa068] shrink-0 transition-colors"
            >
              Apply & Send
            </button>
          </div>
        </form>
      )}

      {/* Parsed Policy & Deterministic Bounds */}
      <div className="pt-3 border-t border-outline/70 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-on-surface-muted divide-x divide-outline/50">
        <div className="flex items-center gap-2">
          <span className="text-on-surface-muted">Ceiling:</span>
          <span className="font-mono text-on-surface font-medium">₹{hardCapRupees}</span>
          <span className="text-[11px] font-mono">({hardCapPaiseFormatted} paise)</span>
        </div>
        <div className="pl-6 flex items-center gap-2">
          <span className="text-on-surface-muted">Policy:</span>
          <span className="text-accent font-medium">Strict Gated Approval</span>
        </div>
        <div className="pl-6 flex items-center gap-2">
          <span className="text-on-surface-muted">Merchant:</span>
          <span className="text-on-surface font-medium">{storeName}</span>
          <span className="text-[11px] font-mono text-on-surface-muted">GET /api/products</span>
        </div>
        <div className="pl-6 flex items-center gap-2">
          <span className="text-on-surface-muted">Rail:</span>
          <span className="text-on-surface font-medium">Razorpay Standard</span>
          <span className="text-[11px] text-on-surface-muted">(Puppeteer)</span>
        </div>
      </div>
    </section>
  );
}
