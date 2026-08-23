import React, { useState, useEffect } from 'react';
import { Node as FTNode, Workflow } from '../../shared/ir';

interface NodeEditorProps {
  node: FTNode;
  workflow: Workflow;
  onUpdateNode: (updatedNode: FTNode) => void;
  onClose?: () => void;
}

export const NodeEditor: React.FC<NodeEditorProps> = ({
  node,
  workflow,
  onUpdateNode,
  onClose,
}) => {
  const [editedNode, setEditedNode] = useState<FTNode>(node);
  const [inputsJson, setInputsJson] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync state when selected node changes
  useEffect(() => {
    setEditedNode(node);
    setInputsJson(JSON.stringify(node.inputs || {}, null, 2));
    setErrors([]);
    setSuccessMsg(null);
  }, [node]);

  const handleFieldChange = (field: keyof FTNode, value: unknown) => {
    setSuccessMsg(null);
    setEditedNode((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleConditionChange = (field: string, value: unknown) => {
    setSuccessMsg(null);
    const currentCond = editedNode.condition || { field: '', operator: 'eq', value: '' };
    setEditedNode((prev) => ({
      ...prev,
      condition: {
        ...currentCond,
        [field]: value,
      },
    }));
  };

  const handleFailurePolicyChange = (field: string, value: unknown) => {
    setSuccessMsg(null);
    const currentPolicy = editedNode.failurePolicy || { action: 'abort' };
    setEditedNode((prev) => ({
      ...prev,
      failurePolicy: {
        ...currentPolicy,
        [field]: value,
      },
    }));
  };

  const removeCondition = () => {
    setSuccessMsg(null);
    setEditedNode((prev) => {
      const rest = { ...prev };
      delete rest.condition;
      return rest;
    });
  };

  const addCondition = () => {
    setSuccessMsg(null);
    setEditedNode((prev) => ({
      ...prev,
      condition: { field: '', operator: 'eq', value: '' },
    }));
  };

  const removeFailurePolicy = () => {
    setSuccessMsg(null);
    setEditedNode((prev) => {
      const rest = { ...prev };
      delete rest.failurePolicy;
      return rest;
    });
  };

  const addFailurePolicy = () => {
    setSuccessMsg(null);
    setEditedNode((prev) => ({
      ...prev,
      failurePolicy: { action: 'abort' },
    }));
  };

  const handleApplyChanges = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSuccessMsg(null);

    const validationErrors: string[] = [];

    // 1. Label Validation
    if (!editedNode.name || editedNode.name.trim() === '') {
      validationErrors.push('Node label/name cannot be empty.');
    }

    // 2. Action Validation
    if (!editedNode.action || editedNode.action.trim() === '') {
      validationErrors.push('API operation action cannot be empty.');
    }

    // 3. Inputs JSON Validation
    let parsedInputs = {};
    try {
      if (inputsJson.trim() !== '') {
        parsedInputs = JSON.parse(inputsJson);
        if (typeof parsedInputs !== 'object' || parsedInputs === null || Array.isArray(parsedInputs)) {
          validationErrors.push('Inputs must be a valid JSON object.');
        }
      }
    } catch (err) {
      validationErrors.push(err instanceof Error ? `Inputs JSON error: ${err.message}` : 'Invalid Inputs JSON syntax.');
    }

    // 4. Condition Validation
    if (editedNode.condition) {
      if (!editedNode.condition.field || editedNode.condition.field.trim() === '') {
        validationErrors.push('Condition Left Operand variable reference cannot be empty.');
      }
      if (!editedNode.condition.operator) {
        validationErrors.push('Condition operator must be selected.');
      }
    }

    // 5. Failure Policy Validation
    if (editedNode.failurePolicy) {
      if (!editedNode.failurePolicy.action) {
        validationErrors.push('Failure policy action must be specified.');
      }
      if (editedNode.failurePolicy.action === 'redirect') {
        if (!editedNode.failurePolicy.redirectTargetId || editedNode.failurePolicy.redirectTargetId.trim() === '') {
          validationErrors.push('Redirect Target Node ID is required when action is redirect.');
        } else {
          const targetId = editedNode.failurePolicy.redirectTargetId.trim();
          if (targetId === editedNode.id) {
            validationErrors.push('Failure policy redirect target cannot be the node itself.');
          }
          const targetExists = workflow.nodes.some(n => n.id === targetId) || workflow.trigger.id === targetId;
          if (!targetExists) {
            validationErrors.push(`Redirect target node ID "${targetId}" does not exist in this workflow.`);
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Apply valid edits to parent draft state
    const finalizedNode: FTNode = {
      ...editedNode,
      inputs: parsedInputs,
    };

    onUpdateNode(finalizedNode);
    setSuccessMsg('Changes applied to local draft sandbox successfully!');
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
    <form onSubmit={handleApplyChanges} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
      {onClose && (
        <button 
          type="button"
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
        <span className="ft-badge ft-badge-warning" style={{ fontSize: '8px', padding: '1px 4px', marginBottom: '4px' }}>
          Draft Node Editor
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <label style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            Node Label / Name
          </label>
          <input
            type="text"
            value={editedNode.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            style={{ ...inputStyles, fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}
            placeholder="Step Name"
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-3)' }}>
        <div>
          <span style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            Node ID
          </span>
          <code style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-brand)', backgroundColor: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}>
            {editedNode.id}
          </code>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            API Operation Action
          </label>
          <input
            type="text"
            value={editedNode.action}
            onChange={(e) => handleFieldChange('action', e.target.value)}
            style={inputStyles}
            placeholder="API Function (e.g. FraudService.check)"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            Inputs / Payload Configuration (JSON)
          </label>
          <textarea
            value={inputsJson}
            onChange={(e) => setInputsJson(e.target.value)}
            style={{
              ...inputStyles,
              fontFamily: 'monospace',
              minHeight: '120px',
              resize: 'vertical',
            }}
            placeholder="Enter input JSON payload (e.g. { 'orderId': '{{trigger.orderId}}' })"
          />
        </div>

        {/* Condition Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Execution Pre-Condition
            </span>
            {editedNode.condition ? (
              <button type="button" className="ft-btn ft-btn-secondary" onClick={removeCondition} style={{ fontSize: '9px', padding: '2px 6px' }}>Remove</button>
            ) : (
              <button type="button" className="ft-btn ft-btn-secondary" onClick={addCondition} style={{ fontSize: '9px', padding: '2px 6px' }}>Add Condition</button>
            )}
          </div>

          {editedNode.condition && (
            <div style={{ border: '1px solid var(--color-warning-border)', backgroundColor: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-warning)' }}>LEFT OPERAND (VARIABLE)</label>
                <input
                  type="text"
                  value={editedNode.condition.field}
                  onChange={(e) => handleConditionChange('field', e.target.value)}
                  style={{ ...inputStyles, border: '1px solid var(--color-warning-border)' }}
                  placeholder="e.g. {{trigger.approved}}"
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-warning)' }}>OPERATOR</label>
                <select
                  value={editedNode.condition.operator}
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
                  value={typeof editedNode.condition.value === 'string' ? editedNode.condition.value : JSON.stringify(editedNode.condition.value)}
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
          )}
        </div>

        {/* Failure Policy Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Failure Recovery Policy
            </span>
            {editedNode.failurePolicy ? (
              <button type="button" className="ft-btn ft-btn-secondary" onClick={removeFailurePolicy} style={{ fontSize: '9px', padding: '2px 6px' }}>Remove</button>
            ) : (
              <button type="button" className="ft-btn ft-btn-secondary" onClick={addFailurePolicy} style={{ fontSize: '9px', padding: '2px 6px' }}>Add Policy</button>
            )}
          </div>

          {editedNode.failurePolicy && (
            <div style={{ border: '1px solid var(--color-error-border)', backgroundColor: 'var(--color-error-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-error)' }}>FAILURE ACTION</label>
                <select
                  value={editedNode.failurePolicy.action}
                  onChange={(e) => handleFailurePolicyChange('action', e.target.value)}
                  style={{ ...inputStyles, border: '1px solid var(--color-error-border)' }}
                >
                  <option value="abort">abort (Abort Run)</option>
                  <option value="skip">skip (Skip Step)</option>
                  <option value="redirect">redirect (Jump to Node)</option>
                </select>
              </div>
              {editedNode.failurePolicy.action === 'redirect' && (
                <div>
                  <label style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--color-error)' }}>REDIRECT TARGET NODE ID</label>
                  <input
                    type="text"
                    value={editedNode.failurePolicy.redirectTargetId || ''}
                    onChange={(e) => handleFailurePolicyChange('redirectTargetId', e.target.value)}
                    style={{ ...inputStyles, border: '1px solid var(--color-error-border)' }}
                    placeholder="e.g. failure-handler"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div style={{ padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong>Validation Errors:</strong>
          <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
            {errors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
        </div>
      )}

      {successMsg && (
        <div style={{ padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', color: 'var(--color-success)', fontSize: 'var(--font-size-xs)' }}>
          {successMsg}
        </div>
      )}

      <button type="submit" className="ft-btn ft-btn-primary" style={{ width: '100%' }}>
        Apply Edits to Draft
      </button>
    </form>
  );
};
