import React, { useState } from 'react';
import { Workflow, Node, Edge } from '../../shared/ir';

export interface DetectionResult {
  success: boolean;
  confidence: number;
  explanation: string;
  warnings: string[];
  workflow: Workflow;
}

interface DetectionComposerProps {
  onDraftGenerated?: (workflow: Workflow) => void;
}

const PRESETS = [
  {
    label: 'Order Placed Process',
    text: 'order placed process with fraud check, billing invoice, slack email confirmation, and dispatch'
  },
  {
    label: 'Asset Request Approval Process',
    text: 'asset request approval process with amount threshold check, dispatch alert on approval, rejection alert, and redirect failure logging'
  },
  {
    label: 'Custom Unrecognized Process',
    text: 'unrecognized workflow requirement with random steps and invalid triggers'
  }
];

const METADATA_REFERENCE = [
  { label: 'Form: order_placed_form', text: 'order_placed_form' },
  { label: 'Form: asset_request_form', text: 'asset_request_form' },
  { label: 'Function: FraudService.check', text: 'FraudService.check' },
  { label: 'Function: EmailService.send', text: 'EmailService.send' },
  { label: 'Function: Slack.post', text: 'Slack.post' },
  { label: 'Operator: eq', text: 'eq' },
  { label: 'Operator: neq', text: 'neq' },
  { label: 'Operator: gt', text: 'gt' }
];

export const DetectionComposer: React.FC<DetectionComposerProps> = ({ onDraftGenerated }) => {
  const [requirement, setRequirement] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val) {
      setRequirement(val);
    }
  };

  const handleMetadataSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val) {
      setRequirement((prev) => (prev ? `${prev} using ${val}` : `Require ${val}`));
      // Reset select
      e.target.value = '';
    }
  };

  const handleDetect = async () => {
    if (!requirement.trim()) {
      setError('Requirement text cannot be empty.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requirement })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      const data: DetectionResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ft-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
      <div>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
          Natural Language Workflow Detector
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-1)', marginBottom: 0 }}>
          Type your business requirement to automatically parse it into a structured FlowTrace DAG draft.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-1)' }}>
            Preset Examples
          </label>
          <select 
            onChange={handlePresetChange}
            style={{ width: '100%', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}
          >
            <option value="">-- Choose an example requirement --</option>
            {PRESETS.map((p, idx) => (
              <option key={idx} value={p.text}>{p.label}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-1)' }}>
            Insert Metadata Helper
          </label>
          <select 
            onChange={handleMetadataSelect}
            style={{ width: '100%', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}
          >
            <option value="">-- Select metadata to append --</option>
            {METADATA_REFERENCE.map((m, idx) => (
              <option key={idx} value={m.text}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-1)' }}>
          Requirement Description
        </label>
        <textarea
          rows={4}
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="e.g. Create an order placed process with a fraud check step using FraudService.check and a slack notification..."
          style={{ width: '100%', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)', color: 'var(--color-text-primary)', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-3)' }}>
        <button 
          className="ft-btn ft-btn-secondary"
          onClick={() => { setRequirement(''); setResult(null); setError(null); }}
          disabled={loading}
        >
          Clear
        </button>
        <button 
          className="ft-btn ft-btn-primary" 
          onClick={handleDetect}
          disabled={loading}
        >
          {loading ? 'Detecting...' : 'Detect Workflow Draft'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
              Detection Results
            </span>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Confidence:</span>
              <span className={`ft-badge ${result.confidence >= 0.7 ? 'ft-badge-success' : 'ft-badge-warning'}`}>
                {Math.round(result.confidence * 100)}%
              </span>
            </div>
          </div>

          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', fontStyle: 'italic' }}>
            &ldquo;{result.explanation}&rdquo;
          </div>

          {result.warnings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-warning)' }}>
                Warnings / Validation Notes:
              </span>
              <ul style={{ margin: 0, paddingLeft: 'var(--spacing-4)', fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>
                {result.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Resulting Workflow Draft Card */}
          <div className="ft-card" style={{ borderStyle: 'dashed', backgroundColor: 'var(--color-bg-secondary)', padding: 'var(--spacing-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-2)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
                  Detected Draft: {result.workflow.id}
                </h4>
                <p style={{ margin: 'var(--spacing-1) 0 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
                  Workflow Version: {result.workflow.version}
                </p>
              </div>
              <span className="ft-badge ft-badge-warning">Draft</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)', marginTop: 'var(--spacing-4)' }}>
              <div style={{ backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-1)' }}>
                  Nodes ({result.workflow.nodes.length})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', maxHeight: '120px', overflowY: 'auto' }}>
                  {result.workflow.nodes.map((n: Node) => (
                    <div key={n.id} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>&bull; {n.name}</span>
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: '10px' }}>({n.type})</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-1)' }}>
                  Edges ({result.workflow.edges.length})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', maxHeight: '120px', overflowY: 'auto' }}>
                  {result.workflow.edges.map((e: Edge, idx: number) => (
                    <div key={idx} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                      <span>&bull; {e.source} &rarr; {e.target}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {onDraftGenerated && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--spacing-2)' }}>
              <button 
                className="ft-btn ft-btn-primary" 
                style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }}
                onClick={() => onDraftGenerated(result.workflow)}
              >
                Inspect Visual Graph &rarr;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
