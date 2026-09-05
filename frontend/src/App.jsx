import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import ScenarioBar from './components/ScenarioBar';
import DirectiveBar from './components/DirectiveBar';
import LiveTimeline from './components/LiveTimeline';
import ApprovalGateway from './components/ApprovalGateway';
import AuditTrailTable from './components/AuditTrailTable';
import FailuresHandledPanel from './components/FailuresHandledPanel';
import Footer from './components/Footer';
import {
  fetchConfig,
  fetchProducts,
  fetchAuditTrail,
  createSession,
  submitApproval,
  triggerDirectBypass,
  subscribeToSession,
} from './api';

export default function App() {
  const [config, setConfig] = useState(null);
  const [products, setProducts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Active user directive
  const [directive, setDirective] = useState(
    'get me an ergonomic study chair under ₹9,000, delivered this week'
  );

  // Active run state
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [paymentProgressLines, setPaymentProgressLines] = useState([]);
  const [approvalData, setApprovalData] = useState(null);
  const [isAwaitingApproval, setIsAwaitingApproval] = useState(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);
  const [resolvedState, setResolvedState] = useState(null); // 'settled' | 'declined' | 'refusal' | null
  const [orderInfo, setOrderInfo] = useState(null);
  const [isBypassing, setIsBypassing] = useState(false);

  // Active evaluation vector tab
  const [activeScenario, setActiveScenario] = useState('idle'); // 'inflight' | 'settled' | 'declined' | 'refusal' | 'idle'

  const unsubscribeRef = useRef(null);

  // Load initial backend configuration and audit logs
  useEffect(() => {
    loadConfig();
    loadProducts();
    loadAuditTrail();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  async function loadConfig() {
    try {
      const data = await fetchConfig();
      setConfig(data);
    } catch (err) {
      console.warn('Failed to load merchant config, falling back to defaults:', err.message);
      setConfig({ maxBudgetPaise: 900000, currency: 'INR', storeName: "Meera's Store" });
    }
  }

  async function loadProducts() {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      console.warn('Failed to load products:', err.message);
    }
  }

  async function loadAuditTrail() {
    setIsLoadingAudit(true);
    try {
      const data = await fetchAuditTrail();
      setAuditLogs(data);
    } catch (err) {
      console.error('Failed to load audit trail:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  }

  // Starts a fresh live Gofer run
  async function handleStartRun(promptToRun) {
    const text = promptToRun || directive;
    if (!text.trim()) return;

    // Clean previous session stream
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setIsRunning(true);
    setEvents([]);
    setPaymentProgressLines([]);
    setApprovalData(null);
    setIsAwaitingApproval(false);
    setResolvedState(null);
    setOrderInfo(null);
    setActiveScenario('inflight');

    try {
      const { sessionId } = await createSession(text);
      setCurrentSessionId(sessionId);

      // Open SSE EventSource stream
      const cleanup = subscribeToSession(
        sessionId,
        (event) => {
          handleIncomingEvent(event);
        },
        (err) => {
          console.warn(`[SSE error for ${sessionId}]:`, err);
        }
      );
      unsubscribeRef.current = cleanup;
    } catch (err) {
      console.error('Failed to start session:', err);
      setIsRunning(false);
      alert(`Error starting Gofer run: ${err.message}`);
    }
  }

  function handleIncomingEvent(event) {
    const { type, data } = event;

    if (type === 'payment_progress') {
      setPaymentProgressLines((prev) => [...prev, data.line || '']);
      return;
    }

    setEvents((prev) => [
      ...prev,
      {
        type,
        data,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      },
    ]);

    if (type === 'awaiting_approval') {
      setApprovalData(data);
      setIsAwaitingApproval(true);
      setActiveScenario('inflight');
    }

    if (type === 'tool_result') {
      if (data?.name === 'request_human_approval') {
        if (data?.output?.approved === false) {
          setResolvedState('declined');
          setActiveScenario('declined');
        }
      }
      if (data?.name === 'place_order' && data?.output?.success) {
        setOrderInfo({
          orderId: data.output.orderId,
          razorpayOrderId: data.output.razorpayOrderId,
          amountInPaise: data.output.amountInPaise,
        });
      }
      if (data?.name === 'complete_payment') {
        if (data?.output?.completed) {
          setResolvedState('settled');
          setActiveScenario('settled');
        } else {
          setResolvedState('failed');
        }
      }
      if (data?.name === 'abort_transaction') {
        setResolvedState('refusal');
        setActiveScenario('refusal');
      }
    }

    if (type === 'run_error') {
      setResolvedState('failed');
      setIsRunning(false);
      setIsAwaitingApproval(false);
    }

    if (type === 'run_complete') {
      setIsRunning(false);
      setIsAwaitingApproval(false);
      // Reload the audit trail from Postgres
      loadAuditTrail();
    }
  }

  // Submits operator approval decision (GATED fence)
  async function handleApprove(approved) {
    if (!currentSessionId) return;

    setIsProcessingApproval(true);
    try {
      await submitApproval(currentSessionId, approved);
      setIsAwaitingApproval(false);
      if (!approved) {
        setResolvedState('declined');
        setActiveScenario('declined');
      }
    } catch (err) {
      console.error('Failed to submit approval:', err);
      alert(`Approval submission failed: ${err.message}`);
    } finally {
      setIsProcessingApproval(false);
    }
  }

  // Direct 422 bypass test — proves the server-side hard budget wall without agent
  async function handleTriggerRefusalBypass() {
    setIsBypassing(true);
    try {
      // 1. Query catalog dynamically to locate an over-budget product
      let catalog = products;
      if (!catalog || catalog.length === 0) {
        catalog = await fetchProducts();
        setProducts(catalog);
      }

      const budgetCap = config?.maxBudgetPaise || 900000;
      const overBudgetProduct = catalog.find((p) => p.priceInPaise > budgetCap);

      if (!overBudgetProduct) {
        alert('No over-budget product found in catalog.');
        return;
      }

      // 2. Direct POST /api/orders bypass
      const result = await triggerDirectBypass({
        productId: overBudgetProduct.id,
        agentReasoning:
          'direct bypass test — proving the server-enforced budget wall holds without the agent',
      });

      // 3. Update UI state to reflect real 422 refusal
      setApprovalData({
        itemName: overBudgetProduct.name,
        amountPaise: overBudgetProduct.priceInPaise,
        agentReasoning: `The candidate item (${overBudgetProduct.name}) costs ₹${(
          overBudgetProduct.priceInPaise / 100
        ).toLocaleString(
          'en-IN'
        )}. The merchant backend strictly refused this transaction with HTTP 422 budget_exceeded independent of the agent — verified by calling the API directly, bypassing Gofer entirely.`,
      });
      setResolvedState('refusal');
      setActiveScenario('refusal');
      setIsAwaitingApproval(false);

      // 4. Reload the immutable audit trail to show the new REFUSAL row
      await loadAuditTrail();
    } catch (err) {
      console.error('Direct bypass test error:', err);
      alert(`Bypass test error: ${err.message}`);
    } finally {
      setIsBypassing(false);
    }
  }

  // Evaluation Vector Tab Switcher
  function handleSelectScenario(scenarioId) {
    if (scenarioId === 'idle') {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setCurrentSessionId(null);
      setIsRunning(false);
      setEvents([]);
      setPaymentProgressLines([]);
      setApprovalData(null);
      setIsAwaitingApproval(false);
      setResolvedState(null);
      setOrderInfo(null);
      setActiveScenario('idle');
      return;
    }

    if (scenarioId === 'inflight') {
      const prompt = 'get me an ergonomic study chair under ₹9,000, delivered this week';
      setDirective(prompt);
      handleStartRun(prompt);
      return;
    }

    if (scenarioId === 'settled') {
      // Drives a fresh live run end-to-end (no static mockup)
      const prompt = 'get me an ergonomic study chair under ₹9,000, delivered this week';
      setDirective(prompt);
      handleStartRun(prompt);
      return;
    }

    if (scenarioId === 'declined') {
      // Drives a live run to test the decline gate
      const prompt = 'get me an ergonomic study chair under ₹9,000, delivered this week';
      setDirective(prompt);
      handleStartRun(prompt);
      return;
    }

    if (scenarioId === 'refusal') {
      handleTriggerRefusalBypass();
    }
  }

  // Determine Live Timeline status pill styling
  let statusPillText = 'IDLE_WAITING_DIRECTIVE';
  let statusPillClass = 'bg-surface border-outline text-on-surface-muted';

  if (activeScenario === 'inflight' || isRunning) {
    if (isAwaitingApproval) {
      statusPillText = 'AWAITING_OPERATOR_SIGNATURE';
      statusPillClass = 'bg-accent-bg text-accent border-accent/30 animate-pulse font-semibold';
    } else {
      statusPillText = 'EXECUTION_IN_PROGRESS';
      statusPillClass = 'bg-accent-bg text-accent border-accent/30';
    }
  } else if (resolvedState === 'settled' || activeScenario === 'settled') {
    statusPillText = 'RUN_COMPLETED_SUCCESS';
    statusPillClass = 'bg-success-bg text-success border-success/30 font-semibold';
  } else if (resolvedState === 'declined' || activeScenario === 'declined') {
    statusPillText = 'HALTED_OPERATOR_DECLINED';
    statusPillClass = 'bg-danger-bg text-danger border-danger/30 font-semibold';
  } else if (resolvedState === 'refusal' || activeScenario === 'refusal') {
    statusPillText = '422_MERCHANT_REFUSAL';
    statusPillClass = 'bg-danger-bg text-danger border-danger/30 font-semibold';
  } else if (resolvedState === 'failed') {
    statusPillText = 'EXECUTION_FAILED';
    statusPillClass = 'bg-danger-bg text-danger border-danger/30 font-semibold';
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col selection:bg-accent/30 selection:text-on-surface">
      {/* Editorial Header */}
      <Header config={config} />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8 flex-1 w-full">
        {/* Scenario Vector Pills */}
        <ScenarioBar
          activeScenario={activeScenario}
          onSelectScenario={handleSelectScenario}
          disabled={isRunning && !isAwaitingApproval}
        />

        {/* Natural Language Spend Directive Bar */}
        <DirectiveBar
          directive={directive}
          setDirective={setDirective}
          onSend={handleStartRun}
          isLoading={isRunning}
          config={config}
        />

        {/* Main Two-Column Trace & Gateway Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Live Tool Timeline (7 cols) */}
          <div className="lg:col-span-7">
            <LiveTimeline
              events={events}
              paymentProgressLines={paymentProgressLines}
              activeScenario={activeScenario}
              statusPillText={statusPillText}
              statusPillClass={statusPillClass}
            />
          </div>

          {/* Right: Gated Operator Approval Card (5 cols) */}
          <div className="lg:col-span-5">
            <ApprovalGateway
              approvalData={approvalData}
              isAwaitingApproval={isAwaitingApproval}
              isProcessingApproval={isProcessingApproval}
              onApprove={handleApprove}
              resolvedState={resolvedState}
              orderInfo={orderInfo}
              config={config}
            />
          </div>
        </div>

        {/* Region 4: Postgres Audit Trail Log */}
        <AuditTrailTable
          logs={auditLogs}
          isLoading={isLoadingAudit}
          onRefresh={loadAuditTrail}
        />

        {/* Region 5: Failures Handled Gracefully Panel */}
        <FailuresHandledPanel
          onTriggerRefusalBypass={handleTriggerRefusalBypass}
          onTriggerDeclineDemo={() => handleSelectScenario('declined')}
          isBypassing={isBypassing}
        />
      </main>

      {/* Editorial Hairline Footer */}
      <Footer config={config} />
    </div>
  );
}
