import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/tokens.css';
import { WorkflowHome } from '../pages/WorkflowHome';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { Workflow } from '../../shared/ir';

const App = () => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [loadingWorkflow, setLoadingWorkflow] = useState<boolean>(false);
  const [errorWorkflow, setErrorWorkflow] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState<Workflow | null>(null);

  const handleBack = () => {
    setSelectedWorkflowId(null);
    setSelectedWorkflow(null);
    setActiveDraft(null);
    setErrorWorkflow(null);
  };

  useEffect(() => {
    if (!selectedWorkflowId) return;

    setLoadingWorkflow(true);
    setErrorWorkflow(null);
    setSelectedWorkflow(null);

    fetch(`/api/workflows/${selectedWorkflowId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch workflow: status ${res.status}`);
        }
        return res.json();
      })
      .then((data: Workflow) => {
        setSelectedWorkflow(data);
      })
      .catch((err) => {
        setErrorWorkflow(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoadingWorkflow(false);
      });
  }, [selectedWorkflowId]);

  return (
    <div>
      <nav style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', padding: 'var(--spacing-4) var(--spacing-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-brand)' }}></div>
          <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            FlowTrace
          </span>
        </div>
        {(selectedWorkflowId || activeDraft) && (
          <button className="ft-btn ft-btn-secondary" onClick={handleBack}>
            &larr; Back to Dashboard
          </button>
        )}
      </nav>

      <main style={{ minHeight: 'calc(100vh - 70px)' }}>
        {!selectedWorkflowId && !activeDraft ? (
          <WorkflowHome 
            onSelectWorkflow={(id) => setSelectedWorkflowId(id)}
            onDraftGenerated={(draft) => setActiveDraft(draft)}
          />
        ) : activeDraft ? (
          <div style={{ padding: 'var(--spacing-6)', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
            <div className="ft-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
                <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)', margin: 0 }}>
                  Active NLP Detected Draft: <span style={{ color: 'var(--color-brand)' }}>{activeDraft.id}</span>
                </h2>
                <span className="ft-badge ft-badge-warning">Draft</span>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-6) 0' }}>
                This workflow definition was generated from your requirement string. You can inspect its configuration and interact with its visual graph representation.
              </p>

              {/* Render visual graph canvas */}
              <div style={{ marginBottom: 'var(--spacing-6)' }}>
                <WorkflowCanvas workflow={activeDraft} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-4)' }}>
                <button className="ft-btn ft-btn-secondary" onClick={handleBack}>
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 'var(--spacing-6)', maxWidth: '1200px', margin: '0 auto' }}>
            {loadingWorkflow && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-12)', color: 'var(--color-text-secondary)' }}>
                <div style={{ fontSize: 'var(--font-size-lg)' }}>Loading workflow details...</div>
              </div>
            )}

            {errorWorkflow && (
              <div className="ft-card" style={{ borderColor: 'var(--color-error-border)', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>Error Loading Workflow</h3>
                <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{errorWorkflow}</p>
                <div>
                  <button className="ft-btn ft-btn-secondary" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error-border)' }} onClick={() => setSelectedWorkflowId(selectedWorkflowId)}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            {selectedWorkflow && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
                <div className="ft-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
                    <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)', margin: 0 }}>
                      Selected Workflow: <span style={{ color: 'var(--color-brand)' }}>{selectedWorkflow.id}</span>
                    </h2>
                    <span className={`ft-badge ${selectedWorkflow.status === 'published' ? 'ft-badge-success' : 'ft-badge-warning'}`}>
                      {selectedWorkflow.status}
                    </span>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-6) 0' }}>
                    Version: <strong>{selectedWorkflow.version}</strong> | Created: {new Date(selectedWorkflow.createdAt).toLocaleString()}
                  </p>

                  {/* Render visual graph canvas */}
                  <div style={{ marginBottom: 'var(--spacing-6)' }}>
                    <WorkflowCanvas workflow={selectedWorkflow} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-4)' }}>
                    <button className="ft-btn ft-btn-secondary" onClick={handleBack}>
                      Back to Dashboard
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
