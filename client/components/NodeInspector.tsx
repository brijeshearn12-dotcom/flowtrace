import React from 'react';
import { Node as FTNode } from '../../shared/ir';

interface NodeInspectorProps {
  node: FTNode | null;
  onClose?: () => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({ node, onClose }) => {
  if (!node) {
    return (
      <div 
        className="ft-card" 
        style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%', 
          minHeight: '250px', 
          borderStyle: 'dashed', 
          color: 'var(--color-text-tertiary)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
          Select a node on the graph to inspect its configuration details.
        </div>
      </div>
    );
  }

  return (
    <div 
      className="ft-card" 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 'var(--spacing-4)', 
        position: 'relative',
        boxSizing: 'border-box'
      }}
    >
      {onClose && (
        <button 
          onClick={onClose}
          style={{ 
            position: 'absolute', 
            top: 'var(--spacing-4)', 
            right: 'var(--spacing-4)', 
            background: 'none', 
            border: 'none', 
            cursor: 'pointer', 
            fontSize: 'var(--font-size-base)', 
            color: 'var(--color-text-tertiary)' 
          }}
        >
          &times;
        </button>
      )}

      <div>
        <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
          Node Inspector
        </span>
        <h3 style={{ margin: 'var(--spacing-1) 0 0 0', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
          {node.name}
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-4)' }}>
        <div>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>
            Node ID
          </span>
          <code style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-brand)', backgroundColor: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}>
            {node.id}
          </code>
        </div>

        <div>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>
            Type & Operation
          </span>
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
            <span className="ft-badge ft-badge-success" style={{ fontSize: '9px', padding: '1px 6px' }}>
              {node.type}
            </span>
            <code style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
              {node.action || 'Manual Trigger'}
            </code>
          </div>
        </div>

        <div>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>
            Inputs / Payload Configuration
          </span>
          {Object.keys(node.inputs || {}).length === 0 ? (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
              No inputs configured.
            </span>
          ) : (
            <pre style={{ margin: 0, backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', overflowX: 'auto', border: '1px solid var(--color-border)' }}>
              {JSON.stringify(node.inputs, null, 2)}
            </pre>
          )}
        </div>

        {node.condition && (
          <div style={{ border: '1px solid var(--color-warning-border)', backgroundColor: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)' }}>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-warning)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Execution Pre-Condition
            </span>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
              Evaluate if: <code>{node.condition.field}</code> <strong>{node.condition.operator}</strong> <code>{JSON.stringify(node.condition.value)}</code>
            </div>
          </div>
        )}

        {node.failurePolicy && (
          <div style={{ border: '1px solid var(--color-error-border)', backgroundColor: 'var(--color-error-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)' }}>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-error)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Failure Recovery Policy
            </span>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
              Action: <strong style={{ textTransform: 'uppercase' }}>{node.failurePolicy.action}</strong>
              {node.failurePolicy.redirectTargetId && (
                <div style={{ marginTop: '4px' }}>
                  Redirect to Node: <code>{node.failurePolicy.redirectTargetId}</code>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
