import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/tokens.css';
import { WorkflowHome } from '../pages/WorkflowHome';

const App = () => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  return (
    <div>
      <nav style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', padding: 'var(--spacing-4) var(--spacing-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-brand)' }}></div>
          <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            FlowTrace
          </span>
        </div>
        {selectedWorkflowId && (
          <button className="ft-btn ft-btn-secondary" onClick={() => setSelectedWorkflowId(null)}>
            &larr; Back to Dashboard
          </button>
        )}
      </nav>

      <main style={{ minHeight: 'calc(100vh - 70px)' }}>
        {!selectedWorkflowId ? (
          <WorkflowHome onSelectWorkflow={(id) => setSelectedWorkflowId(id)} />
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
                <button className="ft-btn ft-btn-primary" onClick={() => setSelectedWorkflowId(null)}>
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
