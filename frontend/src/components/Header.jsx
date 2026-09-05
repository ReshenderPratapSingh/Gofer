import React from 'react';

export default function Header({ config }) {
  const maxBudgetPaise = config?.maxBudgetPaise || 900000;
  const hardCapRupees = (maxBudgetPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const hardCapPaiseFormatted = maxBudgetPaise.toLocaleString('en-IN');
  const storeName = config?.storeName || "Meera’s Store";

  return (
    <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur-md border-b border-outline">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-2xl font-normal tracking-tight text-on-surface">Gofer</span>
            <span className="text-xs text-on-surface-muted hidden sm:inline">/</span>
            <span className="text-xs text-on-surface-muted font-normal tracking-wide hidden sm:inline">
              Autonomous Purchasing Agent
            </span>
          </div>
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full border border-outline bg-surface-low text-xs text-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
            <span>Razorpay Test Mode</span>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 text-xs">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded border border-outline bg-surface">
            <span className="text-on-surface-muted">Target Catalog:</span>
            <span className="font-medium text-on-surface">{storeName}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-accent-dim/40 bg-accent-bg">
            <span className="text-on-surface-muted">Hard Cap:</span>
            <span className="font-mono font-medium text-accent">₹{hardCapRupees}</span>
            <span className="text-[11px] text-on-surface-muted font-mono hidden sm:inline">
              ({hardCapPaiseFormatted} paise)
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-surface border border-outline flex items-center justify-center text-on-surface-muted text-xs font-mono">
            RP
          </div>
        </div>
      </div>
    </header>
  );
}
