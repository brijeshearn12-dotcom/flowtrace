import React, { useEffect, useState } from 'react';
import { DetectionComposer } from '../components/DetectionComposer';
import { Workflow } from '../../shared/ir';

export interface WorkflowListItem {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  latestVersion: number;
  publishedVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowHomeProps {
  onSelectWorkflow: (id: string) => void;
  onDraftGenerated: (workflow: Workflow) => void;
}

export const WorkflowHome: React.FC<WorkflowHomeProps> = ({ onSelectWorkflow, onDraftGenerated }) => {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workflows');
      if (!res.ok) {
        throw new Error(`Failed to load workflows: status ${res.status}`);
      }
      const data = await res.json();
      setWorkflows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  return (
    <div style={{ padding: 'var(--spacing-6)', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-6)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            FlowTrace Workflows
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-1)', marginBottom: 0 }}>
            Select a workflow draft or published version to inspect, publish, and trigger runs, or detect a draft from natural language requirements.
          </p>
        </div>
        <button className="ft-btn ft-btn-primary" onClick={fetchWorkflows} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 'var(--spacing-8)', alignItems: 'flex-start' }}>
        {/* Left Column: Workflows list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            Saved Workflows ({workflows.length})
          </h2>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-12)', gap: 'var(--spacing-4)' }}>
              <div className="ft-spinner"></div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>
                Loading saved workflows...
              </div>
            </div>
          )}

          {error && (
            <div className="ft-card" style={{ borderColor: 'var(--color-error-border)', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <div style={{ display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}>
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)' }}>Error Loading Workflows</h3>
              </div>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{error}</p>
              <div>
                <button className="ft-btn ft-btn-secondary" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error-border)', fontWeight: 'var(--font-weight-medium)' }} onClick={fetchWorkflows}>
                  🔄 Retry Connection
                </button>
              </div>
            </div>
          )}

          {!loading && !error && workflows.length === 0 && (
            <div className="ft-card" style={{ padding: 'var(--spacing-8)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-4)', borderStyle: 'dashed' }}>
              <div style={{ fontSize: '2.5rem' }}>📁</div>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)', fontWeight: 'var(--font-weight-bold)', margin: 0 }}>No Saved Workflows Found</h3>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-2)', maxWidth: '400px', marginInline: 'auto' }}>
                  The local database is currently empty. Run a seed command or generate a new process flow from requirement details.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', width: '100%', maxWidth: '380px', textAlign: 'left', backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--spacing-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}>
                <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>Quick Actions:</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  👉 Use the <strong>Workflow Detector</strong> on the right to enter requirements.
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  👉 Run <code style={{ backgroundColor: 'var(--color-bg-secondary)', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--color-border)' }}>pnpm seed</code> in your terminal.
                </span>
              </div>
            </div>
          )}

          {!loading && !error && workflows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="ft-card"
                  style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => onSelectWorkflow(wf.id)}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-2)' }}>
                      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)', margin: 0 }}>
                        {wf.name}
                      </h3>
                      <span className={`ft-badge ${wf.status === 'published' ? 'ft-badge-success' : 'ft-badge-warning'}`}>
                        {wf.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'monospace', margin: 0 }}>
                      ID: {wf.id}
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--spacing-6)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-3)' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                      Latest Version: <strong>{wf.latestVersion}</strong>
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-brand)', fontWeight: 'var(--font-weight-medium)' }}>
                      Select Workflow &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: NLP Detection Composer */}
        <div>
          <DetectionComposer onDraftGenerated={onDraftGenerated} />
        </div>
      </div>
    </div>
  );
};
