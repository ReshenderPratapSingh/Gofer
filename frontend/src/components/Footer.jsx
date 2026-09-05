import React from 'react';

export default function Footer({ config }) {
  const storeName = config?.storeName || "Meera’s Store";

  return (
    <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-outline text-xs text-on-surface-muted flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="font-serif text-sm text-on-surface">Gofer</span>
        <span>•</span>
        <span>Razorpay Buildathon Autonomous Agent Submission</span>
      </div>
      <div className="flex items-center gap-4 font-mono text-[11px]">
        <span>Store: {storeName}</span>
        <span>•</span>
        <span>Checkout: Puppeteer Standard</span>
        <span>•</span>
        <span>Persistence: Postgres AuditLog</span>
      </div>
    </footer>
  );
}
