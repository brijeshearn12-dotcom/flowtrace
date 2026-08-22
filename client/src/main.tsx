import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/tokens.css';
import { WorkflowHome } from '../pages/WorkflowHome';

import { Workflow, Node, Edge } from '../../shared/ir';

const App = () => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState<Workflow | null>(null);

  const handleBack = () => {
    setSelectedWorkflowId(null);
    setActiveDraft(null);
  };

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
          <div style={{ padding: 'var(--spacing-8)', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
            <div className="ft-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
                <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)', margin: 0 }}>
                  Active NLP Detected Draft: <span style={{ color: 'var(--color-brand)' }}>{activeDraft.id}</span>
                </h2>
                <span className="ft-badge ft-badge-warning">Draft</span>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                This workflow definition was generated from your requirement string. You can inspect its configuration structure below. In the next steps, you will be able to edit this graph inside the interactive React Flow visual canvas.
              </p>

              <div style={{ marginTop: 'var(--spacing-6)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-4)' }}>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', margin: '0 0 var(--spacing-2) 0' }}>Trigger Schema</h3>
                  <pre style={{ backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', overflowX: 'auto', margin: 0 }}>
                    {JSON.stringify(activeDraft.trigger, null, 2)}
                  </pre>
                </div>

                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-4)' }}>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', margin: '0 0 var(--spacing-2) 0' }}>Nodes & Actions</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
                    {activeDraft.nodes.map((n: Node) => (
                      <div key={n.id} style={{ padding: 'var(--spacing-2)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)' }}>
                        <strong>{n.name}</strong> <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>({n.id})</span>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-1)' }}>
                          Type: <code>{n.type}</code> {n.action && <>| Action: <code>{n.action}</code></>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-4)' }}>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', margin: '0 0 var(--spacing-2) 0' }}>Transitions (Edges)</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
                    {activeDraft.edges.map((e: Edge, idx: number) => (
                      <div key={idx} style={{ fontSize: 'var(--font-size-sm)' }}>
                        &bull; <code>{e.source}</code> &rarr; <code>{e.target}</code> {e.condition && <span style={{ color: 'var(--color-brand)' }}> (conditional)</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--spacing-8)', display: 'flex', gap: 'var(--spacing-4)' }}>
                <button className="ft-btn ft-btn-secondary" onClick={handleBack}>
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 'var(--spacing-8)', maxWidth: '1000px', margin: '0 auto' }}>
            <div className="ft-card">
              <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)', marginTop: 0 }}>
                Selected Workflow: <span style={{ color: 'var(--color-brand)' }}>{selectedWorkflowId}</span>
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                You have selected the workflow with ID &ldquo;{selectedWorkflowId}&rdquo;. In the next steps, you will be able to paste requirement prompts to modify this workflow draft and render its interactive React Flow DAG canvas.
              </p>
              <div style={{ marginTop: 'var(--spacing-6)' }}>
                <button className="ft-btn ft-btn-primary" onClick={handleBack}>
                  Go Back
                </button>
              </div>
            </div>
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
