import React from 'react';

export default function ApprovalGateway({
  approvalData,
  isAwaitingApproval,
  isProcessingApproval,
  onApprove,
  resolvedState, // 'settled' | 'declined' | 'refusal' | null
  orderInfo,
  config,
}) {
  const maxBudgetPaise = config?.maxBudgetPaise || 900000;
  const storeName = config?.storeName || "Meera’s Store";

  const itemName = approvalData?.itemName || 'No item selected';
  const amountPaise = approvalData?.amountPaise || 0;
  const amountRupees = (amountPaise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const amountPaiseFormatted = amountPaise.toLocaleString('en-IN');
  const agentReasoning =
    approvalData?.agentReasoning ||
    'Awaiting natural language instruction from operator. Provide product requirements and budget ceiling to begin search on Meera’s Store.';

  const headroomPaise = maxBudgetPaise - amountPaise;
  const headroomRupees = (headroomPaise / 100).toLocaleString('en-IN');

  return (
    <div className="bg-surface rounded-lg border border-outline p-6 space-y-6">
      <div className="border-b border-outline pb-4 flex items-center justify-between">
        <div>
          <h3 className="font-serif text-lg text-on-surface">Operator Approval Gateway</h3>
          <p className="text-xs text-on-surface-muted mt-0.5">
            Hard policy checkpoint before payment moves
          </p>
        </div>
        <span
          className={`text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded font-semibold border ${
            isAwaitingApproval
              ? 'bg-accent-bg text-accent border-accent/30 animate-pulse'
              : resolvedState === 'settled'
              ? 'bg-success-bg text-success border-success/30'
              : resolvedState === 'declined' || resolvedState === 'refusal' || resolvedState === 'failed'
              ? 'bg-danger-bg text-danger border-danger/30'
              : 'bg-surface border-outline text-on-surface-muted'
          }`}
          id="cardStatusTag"
        >
          {isAwaitingApproval
            ? 'Action Required'
            : resolvedState === 'settled'
            ? 'Approved & Settled'
            : resolvedState === 'declined'
            ? 'Declined by Operator'
            : resolvedState === 'refusal'
            ? 'Budget Exceeded (422)'
            : resolvedState === 'failed'
            ? 'Payment Failed'
            : 'Awaiting Input'}
        </span>
      </div>

      {/* Product Summary Box */}
      <div className="bg-surface-low border border-outline rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[11px] text-accent font-medium uppercase tracking-wider">
              {storeName} Catalog
            </span>
            <h4
              className="font-serif text-lg text-on-surface font-medium leading-snug mt-0.5"
              id="cardProductTitle"
            >
              {itemName}
            </h4>
          </div>
          <div className="text-right shrink-0">
            <span
              className="font-serif text-xl font-normal text-on-surface block"
              id="cardProductPrice"
            >
              ₹{amountRupees}
            </span>
            <span className="text-[11px] font-mono text-on-surface-muted">
              {amountPaiseFormatted} paise
            </span>
          </div>
        </div>
        <div className="pt-2 border-t border-outline/60 flex items-center justify-between text-xs text-on-surface-muted">
          <span>Delivery: Standard Test Fulfillment</span>
          {amountPaise > 0 && (
            <span
              className={`font-medium ${
                headroomPaise >= 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {headroomPaise >= 0
                ? `Within ₹${(maxBudgetPaise / 100).toLocaleString('en-IN')} ceiling (-₹${headroomRupees} headroom)`
                : `Exceeds ₹${(maxBudgetPaise / 100).toLocaleString('en-IN')} ceiling by ₹${(
                    Math.abs(headroomPaise) / 100
                  ).toLocaleString('en-IN')}`}
            </span>
          )}
        </div>
      </div>

      {/* Agent Reasoning Quote (Verbatim Plain English) */}
      <div className="space-y-2">
        <span className="text-xs text-on-surface-muted uppercase tracking-wider font-medium">
          Gofer Agent Rationale
        </span>
        <blockquote
          className="bg-surface-low border-l-2 border-accent p-3 rounded-r text-xs text-on-surface leading-relaxed italic"
          id="agentRationaleText"
        >
          "{agentReasoning}"
        </blockquote>
      </div>

      {/* Dynamic Action Buttons for Gated Approval */}
      {isAwaitingApproval && (
        <div className="space-y-3 pt-2" id="approvalActionBlock">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isProcessingApproval}
              onClick={() => onApprove(true)}
              className="w-full py-2.5 px-4 bg-accent hover:bg-[#bfa068] text-background font-semibold text-xs rounded tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">check</span>
              <span>APPROVE (₹{amountRupees})</span>
            </button>
            <button
              type="button"
              disabled={isProcessingApproval}
              onClick={() => onApprove(false)}
              className="w-full py-2.5 px-4 bg-surface-high hover:bg-surface-highest border border-outline text-on-surface font-medium text-xs rounded tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base text-danger">close</span>
              <span>Decline</span>
            </button>
          </div>
          <p className="text-[11px] text-center text-on-surface-muted">
            Approval instructs Puppeteer to open checkout and execute test card payment.
          </p>
        </div>
      )}

      {/* Settled State Resolution Block */}
      {resolvedState === 'settled' && (
        <div className="bg-success-bg border border-success/40 rounded p-4 space-y-2">
          <div className="flex items-center gap-2 text-success">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span className="font-mono text-xs font-semibold uppercase">Authorized &amp; Paid</span>
          </div>
          <p className="text-xs text-on-surface leading-relaxed">
            Approved by operator Rohan. Order{' '}
            <code className="font-mono text-accent">
              {orderInfo?.orderId || '#ORDER-CONFIRMED'}
            </code>{' '}
            created on Meera’s Store. Razorpay payment verified and captured.
          </p>
        </div>
      )}

      {/* Declined State Resolution Block */}
      {resolvedState === 'declined' && (
        <div className="bg-danger-bg border border-danger/40 rounded p-4 space-y-2">
          <div className="flex items-center gap-2 text-danger">
            <span className="material-symbols-outlined text-base">cancel</span>
            <span className="font-mono text-xs font-semibold uppercase">Operator Declined Run</span>
          </div>
          <p className="text-xs text-on-surface leading-relaxed">
            Rohan declined — no order created, no charge, clean stop.
          </p>
        </div>
      )}

      {/* Merchant Refusal Resolution Block */}
      {resolvedState === 'refusal' && (
        <div className="bg-danger-bg border border-danger/40 rounded p-4 space-y-2">
          <div className="flex items-center gap-2 text-danger">
            <span className="material-symbols-outlined text-base">block</span>
            <span className="font-mono text-xs font-semibold uppercase">422 Merchant Refusal Recorded</span>
          </div>
          <p className="text-xs text-on-surface leading-relaxed">
            The merchant rejected this independent of the agent — verified by calling the API directly, bypassing Gofer entirely.
          </p>
        </div>
      )}

      {/* Payment Failed Resolution Block */}
      {resolvedState === 'failed' && (
        <div className="bg-danger-bg border border-danger/40 rounded p-4 space-y-2">
          <div className="flex items-center gap-2 text-danger">
            <span className="material-symbols-outlined text-base">error</span>
            <span className="font-mono text-xs font-semibold uppercase">Payment Automation Failed</span>
          </div>
          <p className="text-xs text-on-surface leading-relaxed">
            Headless checkout automation encountered an error or navigation timeout. Check the execution trace below for details.
          </p>
        </div>
      )}
    </div>
  );
}
