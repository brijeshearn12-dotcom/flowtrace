import React, { useState, useEffect } from 'react';
import { Workflow } from '../../shared/ir';

interface TriggerPanelProps {
  workflow: Workflow;
  onRunSuccess?: (runId: string) => void;
}

interface SchemaProperty {
  type: string;
  title?: string;
  description?: string;
}

interface TriggerSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

export const TriggerPanel: React.FC<TriggerPanelProps> = ({ workflow, onRunSuccess }) => {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  // Extract properties and required list safely from trigger schema
  const { properties, requiredFields } = React.useMemo(() => {
    const schema = (workflow.trigger.schema || {}) as TriggerSchema;
    return {
      properties: schema.properties || {},
      requiredFields: schema.required || [],
    };
  }, [workflow]);

  // Reset inputs when workflow changes
  useEffect(() => {
    const initialData: Record<string, string> = {};
    Object.keys(properties).forEach((key) => {
      const prop = properties[key];
      if (prop.type === 'boolean') {
        initialData[key] = 'false';
      } else {
        initialData[key] = '';
      }
    });
    setFormData(initialData);
    setRunId(null);
    setError(null);
    setLoading(false);
  }, [properties]);

  const handleInputChange = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCheckboxChange = (key: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      [key]: checked ? 'true' : 'false',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRunId(null);

    // 1. Validate payload inputs before running
    const payload: Record<string, unknown> = {};
    const validationErrors: string[] = [];

    Object.keys(properties).forEach((key) => {
      const prop = properties[key];
      const val = formData[key];
      const isRequired = requiredFields.includes(key);

      if (isRequired && (val === undefined || val === '')) {
        validationErrors.push(`Field "${prop.title || key}" is required.`);
        return;
      }

      if (val !== undefined && val !== '') {
        if (prop.type === 'number') {
          const num = Number(val);
          if (isNaN(num)) {
            validationErrors.push(`Field "${prop.title || key}" must be a valid number.`);
          } else {
            payload[key] = num;
          }
        } else if (prop.type === 'boolean') {
          payload[key] = val === 'true';
        } else {
          payload[key] = val;
        }
      }
    });

    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      setLoading(false);
      return;
    }

    try {
      // 2. Call the workflow run API: POST /api/workflows/:id/run
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Run failed: status ${res.status}`);
      }

      if (data.success && data.run) {
        setRunId(data.run.id);
        if (onRunSuccess) {
          onRunSuccess(data.run.id);
        }
      } else {
        throw new Error('API returned success but no run data found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ft-card" style={{ boxSizing: 'border-box' }}>
      <h3 style={{ margin: '0 0 var(--spacing-4) 0', fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
        Trigger Manual Run
      </h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
        {Object.keys(properties).length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
            No trigger configuration payload fields are required for this manual trigger.
          </p>
        ) : (
          Object.keys(properties).map((key) => {
            const prop = properties[key];
            const isRequired = requiredFields.includes(key);
            const value = formData[key] || '';

            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)' }}>
                  {prop.title || key} {isRequired && <span style={{ color: 'var(--color-error)' }}>*</span>}
                </label>

                {prop.type === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', cursor: 'pointer', margin: '4px 0', fontSize: 'var(--font-size-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={value === 'true'}
                      onChange={(e) => handleCheckboxChange(key, e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                      Enabled
                    </span>
                  </label>
                ) : (
                  <input
                    type={prop.type === 'number' ? 'number' : 'text'}
                    step={prop.type === 'number' ? 'any' : undefined}
                    value={value}
                    onChange={(e) => handleInputChange(key, e.target.value)}
                    style={{
                      padding: 'var(--spacing-2) var(--spacing-3)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      fontSize: 'var(--font-size-xs)',
                      fontFamily: 'inherit',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                    placeholder={`Enter ${prop.title || key}`}
                  />
                )}
              </div>
            );
          })
        )}

        {error && (
          <div style={{ padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)', wordBreak: 'break-word' }}>
            {error}
          </div>
        )}

        {runId && (
          <div style={{ padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', color: 'var(--color-success)', fontSize: 'var(--font-size-xs)' }}>
            <strong>Run Triggered successfully!</strong>
            <div style={{ marginTop: '4px', fontFamily: 'monospace' }}>
              Run ID: {runId}
            </div>
          </div>
        )}

        <button 
          type="submit" 
          className="ft-btn ft-btn-primary" 
          disabled={loading}
          style={{ width: '100%', marginTop: 'var(--spacing-2)' }}
        >
          {loading ? 'Executing Run...' : 'Execute Manual Run'}
        </button>
      </form>
    </div>
  );
};
