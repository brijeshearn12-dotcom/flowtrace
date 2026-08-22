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
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-12)', color: 'var(--color-text-secondary)' }}>
              <div style={{ fontSize: 'var(--font-size-lg)' }}>Loading workflows...</div>
            </div>
          )}

          {error && (
            <div className="ft-card" style={{ borderColor: 'var(--color-error-border)', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>Error Loading Workflows</h3>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{error}</p>
              <div>
                <button className="ft-btn ft-btn-secondary" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error-border)' }} onClick={fetchWorkflows}>
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {!loading && !error && workflows.length === 0 && (
            <div className="ft-card" style={{ textAlign: 'center', padding: 'var(--spacing-12)' }}>
              <h3 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)', margin: 0 }}>No Workflows Found</h3>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-2)' }}>
                There are no workflows seeded in the database. Please run the seeder script to initialize them.
              </p>
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
