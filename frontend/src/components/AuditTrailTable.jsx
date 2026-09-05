import React from 'react';

export default function AuditTrailTable({ logs, isLoading, onRefresh }) {
  const formatTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', { hour12: false, fractionalSecondDigits: 3 });
    } catch {
      return isoString;
    }
  };

  const getActionBadge = (action, log) => {
    switch (action) {
      case 'SEARCH':
        return (
          <span className="px-2 py-0.5 rounded bg-surface-low border border-outline text-success font-semibold">
            SEARCH
          </span>
        );
      case 'APPROVAL_REQUESTED':
        return (
          <span className="px-2 py-0.5 rounded bg-accent-bg border border-accent/40 text-accent font-semibold">
            GATED
          </span>
        );
      case 'APPROVAL_GRANTED':
        return (
          <span className="px-2 py-0.5 rounded bg-success-bg border border-success/40 text-success font-semibold">
            APPROVED
          </span>
        );
      case 'APPROVAL_DENIED':
        return (
          <span className="px-2 py-0.5 rounded bg-danger-bg border border-danger/40 text-danger font-semibold">
            DECLINED
          </span>
        );
      case 'PLACE_ORDER':
        return (
          <span className="px-2 py-0.5 rounded bg-surface-low border border-accent/40 text-accent font-semibold">
            ORDER_PLACED
          </span>
        );
      case 'PAYMENT_SUCCESS':
        return (
          <span className="px-2 py-0.5 rounded bg-success-bg border border-success/40 text-success font-semibold">
            PAID
          </span>
        );
      case 'REFUSAL':
        return (
          <span className="px-2 py-0.5 rounded bg-danger-bg border border-danger/40 text-danger font-semibold">
            422 REFUSAL
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-surface border border-outline text-on-surface-muted font-mono">
            {action}
          </span>
        );
    }
  };

  return (
    <section className="bg-surface rounded-lg border border-outline p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline pb-4">
        <div>
          <h3 className="font-serif text-lg text-on-surface">Postgres Audit Trail Log</h3>
          <p className="text-xs text-on-surface-muted mt-0.5">
            Immutable runtime records sourced from{' '}
            <code className="text-on-surface font-mono">GET /api/audit-trail</code>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
            <span className="text-xs font-mono text-on-surface-muted">
              Storage: PostgreSQL `AuditLog` Table ({logs?.length || 0} rows)
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="px-2.5 py-1 rounded border border-outline bg-surface-low hover:text-on-surface text-on-surface-muted text-xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-outline text-on-surface-muted uppercase text-[11px] tracking-wider">
              <th className="py-3 px-3">Timestamp</th>
              <th className="py-3 px-3">Tool / Action</th>
              <th className="py-3 px-3 font-sans">Natural Language Rationale</th>
              <th className="py-3 px-3">Product &amp; Context</th>
              <th className="py-3 px-3 text-right">Amount</th>
              <th className="py-3 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline/50 text-on-surface" id="auditTableBody">
            {logs && logs.length > 0 ? (
              logs.map((log) => {
                const product = log.order?.product;
                const priceInPaise = log.order?.amountInPaise || log.metadata?.amountPaise || log.metadata?.priceInPaise;
                const priceFormatted = priceInPaise
                  ? `₹${(priceInPaise / 100).toLocaleString('en-IN')}`
                  : '—';

                return (
                  <tr key={log.id} className="hover:bg-surface-low/50 transition-colors">
                    <td className="py-3 px-3 text-on-surface-muted whitespace-nowrap">
                      {formatTime(log.createdAt)}
                    </td>
                    <td className="py-3 px-3 font-semibold text-accent whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3 px-3 font-sans text-on-surface text-xs leading-relaxed max-w-md">
                      {log.reasoning}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-on-surface-muted">
                      {product?.name || (log.orderId ? `Order #${log.orderId.slice(-8)}` : '—')}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap font-medium text-on-surface">
                      {priceFormatted}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {getActionBadge(log.action, log)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="py-8 text-center text-on-surface-muted">
                  {isLoading ? 'Loading audit trail from database...' : 'No audit entries found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
