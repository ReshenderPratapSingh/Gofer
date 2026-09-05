import React from 'react';

export default function LiveTimeline({
  events,
  paymentProgressLines,
  activeScenario,
  statusPillText,
  statusPillClass,
}) {
  const getToolIcon = (name) => {
    switch (name) {
      case 'search_products':
        return 'search';
      case 'request_human_approval':
        return 'policy';
      case 'place_order':
        return 'shopping_cart';
      case 'complete_payment':
        return 'credit_card';
      case 'abort_transaction':
        return 'cancel';
      case 'agent_text':
        return 'chat';
      default:
        return 'terminal';
    }
  };

  // Group events by tool calls and pair them with their tool_results where applicable
  const renderedSteps = [];
  let currentCall = null;

  events.forEach((ev, idx) => {
    if (ev.type === 'tool_call') {
      currentCall = {
        id: `call-${idx}`,
        name: ev.data?.name,
        args: ev.data?.args || {},
        timestamp: ev.timestamp || new Date().toLocaleTimeString('en-IN', { hour12: false }),
        result: null,
      };
      renderedSteps.push(currentCall);
    } else if (ev.type === 'tool_result' && currentCall && currentCall.name === ev.data?.name) {
      currentCall.result = ev.data?.output;
    } else if (ev.type === 'agent_text') {
      renderedSteps.push({
        id: `text-${idx}`,
        name: 'agent_text',
        args: {},
        text: ev.data?.text,
        timestamp: ev.timestamp || new Date().toLocaleTimeString('en-IN', { hour12: false }),
      });
    } else if (ev.type === 'run_error') {
      renderedSteps.push({
        id: `err-${idx}`,
        name: 'run_error',
        args: {},
        error: ev.data?.error || 'Execution encountered an unexpected error.',
        timestamp: ev.timestamp || new Date().toLocaleTimeString('en-IN', { hour12: false }),
      });
    }
  });

  return (
    <div className="bg-surface rounded-lg border border-outline p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-outline pb-4">
        <div>
          <h3 className="font-serif text-lg text-on-surface">Live Execution Trace</h3>
          <p className="text-xs text-on-surface-muted mt-0.5">
            Deterministic tool invocation sequence matching real agent runtime
          </p>
        </div>
        <span
          className={`text-xs font-mono px-2.5 py-1 rounded border ${statusPillClass}`}
          id="runtimeStatusPill"
        >
          {statusPillText}
        </span>
      </div>

      {renderedSteps.length === 0 ? (
        <div className="py-12 text-center text-on-surface-muted text-xs font-mono space-y-2">
          <span className="material-symbols-outlined text-3xl opacity-40">hourglass_empty</span>
          <p>Ready on standby. Send a directive above to watch Gofer reason and execute live.</p>
        </div>
      ) : (
        <div className="space-y-6 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-outline">
          {renderedSteps.map((step, index) => {
            if (step.name === 'run_error') {
              return (
                <div key={step.id || index} className="relative pl-7 group">
                  <div className="absolute left-0 top-1 w-[23px] h-[23px] rounded-full bg-surface border border-danger text-danger flex items-center justify-center text-xs">
                    <span className="material-symbols-outlined text-[13px]">error</span>
                  </div>
                  <div className="bg-surface-low border border-danger/40 rounded p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-danger">
                        Execution Error
                      </span>
                      <span className="text-on-surface-muted text-[11px] font-mono">
                        {step.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-danger font-mono whitespace-pre-wrap break-all">
                      {typeof step.error === 'object' ? JSON.stringify(step.error, null, 2) : step.error}
                    </p>
                  </div>
                </div>
              );
            }

            const icon = getToolIcon(step.name);
            const isCompletePayment = step.name === 'complete_payment';
            const isApproval = step.name === 'request_human_approval';

            return (
              <div key={step.id || index} className="relative pl-7 group">
                <div
                  className={`absolute left-0 top-1 w-[23px] h-[23px] rounded-full bg-surface border flex items-center justify-center text-xs ${
                    step.result?.error
                      ? 'border-danger text-danger'
                      : isApproval
                      ? 'border-accent text-accent'
                      : step.result
                      ? 'border-success text-success'
                      : 'border-outline text-accent'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">{icon}</span>
                </div>

                <div
                  className={`bg-surface-low border rounded p-4 space-y-2 ${
                    isApproval ? 'border-accent/40' : 'border-outline'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-accent">
                        {index + 1}. {step.name === 'agent_text' ? 'Gofer Response' : `tool: ${step.name}`}
                      </span>
                      <span className="text-on-surface-muted text-[11px] font-mono">
                        {step.timestamp}
                      </span>
                    </div>

                    {step.name === 'search_products' && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-outline text-success">
                        {step.result
                          ? `200 OK • ${step.result.products?.length || 0} match(es)`
                          : 'searching...'}
                      </span>
                    )}

                    {isApproval && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent-bg border border-accent/40 text-accent font-semibold">
                        {step.result === null
                          ? 'GATING_PAUSE'
                          : step.result?.approved
                          ? 'APPROVED_BY_ROHAN'
                          : 'DECLINED_BY_ROHAN'}
                      </span>
                    )}

                    {step.name === 'place_order' && (
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                          step.result?.success
                            ? 'bg-success-bg border-success/40 text-success'
                            : 'bg-surface border-outline text-on-surface-muted'
                        }`}
                      >
                        {step.result?.success
                          ? `ORDER_CREATED (${step.result.orderId})`
                          : 'ordering...'}
                      </span>
                    )}

                    {isCompletePayment && (
                      <span
                        className={`text-[11px] font-mono px-2 py-0.5 rounded border font-semibold ${
                          step.result === null
                            ? 'bg-accent-bg border-accent/40 text-accent'
                            : step.result?.completed
                            ? 'bg-success-bg border-success/40 text-success'
                            : 'bg-danger-bg border-danger/40 text-danger'
                        }`}
                      >
                        {step.result === null
                          ? 'PAYMENT_ACTIVE'
                          : step.result?.completed
                          ? 'RAZORPAY_PAID'
                          : 'PAYMENT_FAILED'}
                      </span>
                    )}

                    {step.name === 'abort_transaction' && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-danger-bg border border-danger/40 text-danger font-semibold">
                        ABORTED
                      </span>
                    )}
                  </div>

                  {/* Arguments / Payload Preview */}
                  {Object.keys(step.args || {}).length > 0 && (
                    <div className="font-mono text-xs text-on-surface-muted bg-surface/50 p-2 rounded border border-outline/50 overflow-x-auto">
                      payload: {JSON.stringify(step.args)}
                    </div>
                  )}

                  {/* Reasoning Text Rendered Verbatim */}
                  {step.args?.agentReasoning && (
                    <p className="text-xs text-on-surface leading-relaxed italic border-l-2 border-accent pl-2.5">
                      "{step.args.agentReasoning}"
                    </p>
                  )}
                  {step.args?.reason && (
                    <p className="text-xs text-danger leading-relaxed border-l-2 border-danger pl-2.5">
                      {step.args.reason}
                    </p>
                  )}
                  {step.text && (
                    <p className="text-xs text-on-surface leading-relaxed">
                      {step.text}
                    </p>
                  )}

                  {/* Live Puppeteer Payment Progress Output */}
                  {isCompletePayment && paymentProgressLines && paymentProgressLines.length > 0 && (
                    <div className="mt-3 bg-surface-lowest border border-outline/70 rounded p-3 font-mono text-[11px] text-on-surface-muted space-y-1 max-h-48 overflow-y-auto">
                      <div className="flex items-center gap-1.5 text-accent font-semibold pb-1 border-b border-outline/40">
                        <span className="material-symbols-outlined text-xs animate-spin">
                          progress_activity
                        </span>
                        <span>Puppeteer Headless Automation Progress:</span>
                      </div>
                      {paymentProgressLines.map((line, lIdx) => (
                        <div key={lIdx} className="leading-snug">
                          <span className="text-accent-dim mr-1.5">&gt;</span>
                          <span
                            className={
                              line.includes('✅') || line.includes('verified')
                                ? 'text-success font-semibold'
                                : line.includes('❌') || line.includes('failed')
                                ? 'text-danger'
                                : 'text-on-surface-muted'
                            }
                          >
                            {line}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
