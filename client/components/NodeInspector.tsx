import React, { useState, useEffect } from 'react';
import { Node as FTNode } from '../../shared/ir';

interface NodeInspectorProps {
  node: FTNode | null;
  onClose?: () => void;
  isEditable?: boolean;
  onUpdateNode?: (updatedNode: FTNode) => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  onClose,
  isEditable = false,
  onUpdateNode,
}) => {
  const [inputsJson, setInputsJson] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync inputs raw json representation when selected node changes
  useEffect(() => {
    if (node) {
      setInputsJson(JSON.stringify(node.inputs || {}, null, 2));
      setJsonError(null);
    }
  }, [node]);

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
          Select a node on the graph to inspect and configure its details.
        </div>
      </div>
    );
  }

  const isTrigger = node.action === 'trigger';
  const canEdit = isEditable && !isTrigger;

  const handleInputChange = (field: keyof FTNode, value: unknown) => {
    if (onUpdateNode) {
      onUpdateNode({
        ...node,
        [field]: value,
      });
    }
  };

  const handleInputsJsonChange = (val: string) => {
    setInputsJson(val);
    try {
      if (val.trim() === '') {
        handleInputChange('inputs', {});
        setJsonError(null);
        return;
      }
      const parsed = JSON.parse(val);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('JSON must be an object');
      }
      handleInputChange('inputs', parsed);
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON format');
    }
  };

  const handleConditionChange = (field: string, value: unknown) => {
    if (!onUpdateNode) return;
    const currentCond = node.condition || { field: '', operator: 'eq', value: '' };
    onUpdateNode({
      ...node,
      condition: {
        ...currentCond,
        [field]: value,
      },
    });
  };

  const handleFailurePolicyChange = (field: string, value: unknown) => {
    if (!onUpdateNode) return;
    const currentPolicy = node.failurePolicy || { action: 'abort' };
    onUpdateNode({
      ...node,
      failurePolicy: {
        ...currentPolicy,
        [field]: value,
      },
    });
  };

  const removeCondition = () => {
    if (onUpdateNode) {
      const rest = { ...node };
      delete rest.condition;
      onUpdateNode(rest);
    }
  };

  const addCondition = () => {
    if (onUpdateNode) {
      onUpdateNode({
        ...node,
        condition: { field: '', operator: 'eq', value: '' },
      });
    }
  };

  const removeFailurePolicy = () => {
    if (onUpdateNode) {
      const rest = { ...node };
      delete rest.failurePolicy;
      onUpdateNode(rest);
    }
  };

  const addFailurePolicy = () => {
    if (onUpdateNode) {
      onUpdateNode({
        ...node,
        failurePolicy: { action: 'abort' },
      });
    }
  };

  const inputStyles = {
    padding: 'var(--spacing-2) var(--spacing-3)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    fontSize: 'var(--font-size-xs)',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--color-bg-secondary)',
    color: 'var(--color-text-primary)',
    marginTop: '2px',
  };

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
        <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            Node Configurator
          </span>
          {isTrigger && <span className="ft-badge ft-badge-success" style={{ fontSize: '8px', padding: '1px 4px' }}>Trigger Node</span>}
          {!isTrigger && isEditable && <span className="ft-badge ft-badge-warning" style={{ fontSize: '8px', padding: '1px 4px' }}>Draft Edit Mode</span>}
        </div>
        
        {canEdit ? (
          <input
            type="text"
            value={node.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            style={{ ...inputStyles, fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}
            placeholder="Step Name"
          />
        ) : (
          <h3 style={{ margin: 'var(--spacing-1) 0 0 0', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
            {node.name}
          </h3>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-4)' }}>
        <div>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            Node ID
          </span>
          <code style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-brand)', backgroundColor: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}>
            {node.id}
          </code>
        </div>

        <div>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            Type & API Operation
          </span>
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center', marginTop: '2px' }}>
            <span className="ft-badge ft-badge-success" style={{ fontSize: '9px', padding: '1px 6px' }}>
              {node.type}
            </span>
            {canEdit ? (
              <input
                type="text"
                value={node.action}
                onChange={(e) => handleInputChange('action', e.target.value)}
                style={inputStyles}
                placeholder="API Function (e.g. FraudService.check)"
              />
            ) : (
              <code style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                {node.action || 'Manual Trigger'}
              </code>
            )}
          </div>
        </div>

        <div>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>
            Inputs / Payload Configuration
          </span>
          {canEdit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <textarea
                value={inputsJson}
                onChange={(e) => handleInputsJsonChange(e.target.value)}
                style={{
                  ...inputStyles,
                  fontFamily: 'monospace',
                  minHeight: '120px',
                  resize: 'vertical',
                }}
                placeholder="Enter input JSON payload (e.g. { 'orderId': '{{trigger.orderId}}' })"
              />
              {jsonError && (
                <span style={{ fontSize: '10px', color: 'var(--color-error)' }}>
                  Error: {jsonError}
                </span>
              )}
            </div>
          ) : (
            Object.keys(node.inputs || {}).length === 0 ? (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                No inputs configured.
              </span>
            ) : (
              <pre style={{ margin: 0, backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', overflowX: 'auto', border: '1px solid var(--color-border)' }}>
                {JSON.stringify(node.inputs, null, 2)}
              </pre>
            )
          )}
        </div>

        {/* Condition Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Execution Pre-Condition
            </span>
            {canEdit && (
              node.condition ? (
                <button className="ft-btn ft-btn-secondary" onClick={removeCondition} style={{ fontSize: '9px', padding: '2px 6px' }}>Remove</button>
              ) : (
                <button className="ft-btn ft-btn-secondary" onClick={addCondition} style={{ fontSize: '9px', padding: '2px 6px' }}>Add Condition</button>
              )
            )}
          </div>

          {node.condition ? (
            <div style={{ border: '1px solid var(--color-warning-border)', backgroundColor: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)' }}>
              {canEdit ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
                  <div>
                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-warning)' }}>LEFT OPERAND (VARIABLE)</label>
                    <input
                      type="text"
                      value={node.condition.field}
                      onChange={(e) => handleConditionChange('field', e.target.value)}
                      style={{ ...inputStyles, border: '1px solid var(--color-warning-border)' }}
                      placeholder="e.g. {{trigger.approved}}"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-warning)' }}>OPERATOR</label>
                    <select
                      value={node.condition.operator}
                      onChange={(e) => handleConditionChange('operator', e.target.value)}
                      style={{ ...inputStyles, border: '1px solid var(--color-warning-border)' }}
                    >
                      <option value="eq">eq (Equal)</option>
                      <option value="neq">neq (Not Equal)</option>
                      <option value="gt">gt (Greater Than)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-warning)' }}>RIGHT OPERAND (VALUE)</label>
                    <input
                      type="text"
                      value={typeof node.condition.value === 'string' ? node.condition.value : JSON.stringify(node.condition.value)}
                      onChange={(e) => {
                        let parsedVal: unknown = e.target.value;
                        if (e.target.value === 'true') parsedVal = true;
                        else if (e.target.value === 'false') parsedVal = false;
                        else if (!isNaN(Number(e.target.value)) && e.target.value.trim() !== '') parsedVal = Number(e.target.value);
                        handleConditionChange('value', parsedVal);
                      }}
                      style={{ ...inputStyles, border: '1px solid var(--color-warning-border)' }}
                      placeholder="e.g. true"
                    />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                  Evaluate if: <code>{node.condition.field}</code> <strong>{node.condition.operator}</strong> <code>{JSON.stringify(node.condition.value)}</code>
                </div>
              )}
            </div>
          ) : (
            !canEdit && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                No execution condition configured.
              </span>
            )
          )}
        </div>

        {/* Failure Policy Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Failure Recovery Policy
            </span>
            {canEdit && (
              node.failurePolicy ? (
                <button className="ft-btn ft-btn-secondary" onClick={removeFailurePolicy} style={{ fontSize: '9px', padding: '2px 6px' }}>Remove</button>
              ) : (
                <button className="ft-btn ft-btn-secondary" onClick={addFailurePolicy} style={{ fontSize: '9px', padding: '2px 6px' }}>Add Policy</button>
              )
            )}
          </div>

          {node.failurePolicy ? (
            <div style={{ border: '1px solid var(--color-error-border)', backgroundColor: 'var(--color-error-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)' }}>
              {canEdit ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
                  <div>
                    <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-error)' }}>FAILURE ACTION</label>
                    <select
                      value={node.failurePolicy.action}
                      onChange={(e) => handleFailurePolicyChange('action', e.target.value)}
                      style={{ ...inputStyles, border: '1px solid var(--color-error-border)' }}
                    >
                      <option value="abort">abort (Abort Run)</option>
                      <option value="skip">skip (Skip Step)</option>
                      <option value="redirect">redirect (Jump to Node)</option>
                    </select>
                  </div>
                  {node.failurePolicy.action === 'redirect' && (
                    <div>
                      <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-error)' }}>REDIRECT TARGET NODE ID</label>
                      <input
                        type="text"
                        value={node.failurePolicy.redirectTargetId || ''}
                        onChange={(e) => handleFailurePolicyChange('redirectTargetId', e.target.value)}
                        style={{ ...inputStyles, border: '1px solid var(--color-error-border)' }}
                        placeholder="e.g. failure-handler"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                  Action: <strong style={{ textTransform: 'uppercase' }}>{node.failurePolicy.action}</strong>
                  {node.failurePolicy.redirectTargetId && (
                    <div style={{ marginTop: '4px' }}>
                      Redirect to Node: <code>{node.failurePolicy.redirectTargetId}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            !canEdit && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                No failure recovery policy configured (defaults to Abort).
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
};
