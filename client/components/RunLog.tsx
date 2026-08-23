import React, { useState } from 'react';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  stepId?: string;
  type: string;
  action?: string;
  inputs?: unknown;
  output?: unknown;
  error?: string;
  failurePolicy?: {
    action: string;
    redirectTargetId?: string;
  };
  status?: string;
  [key: string]: unknown;
}

interface RunLogProps {
  logs: LogEntry[];
}

export const RunLog: React.FC<RunLogProps> = ({ logs }) => {
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});

  const toggleExpand = (index: number) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const getLogColors = (entry: LogEntry) => {
    switch (entry.level) {
      case 'error':
        return {
          bg: 'var(--color-error-bg)',
          border: 'var(--color-error-border)',
          text: 'var(--color-error)',
        };
      case 'warn':
        return {
          bg: 'var(--color-warning-bg)',
          border: 'var(--color-warning-border)',
          text: 'var(--color-warning)',
        };
      default:
        if (entry.type === 'run_start' || entry.type === 'run_complete') {
          return {
            bg: 'var(--color-running-bg)',
            border: 'var(--color-running-border)',
            text: 'var(--color-running)',
          };
        }
        return {
          bg: 'var(--color-bg-primary)',
          border: 'var(--color-border)',
          text: 'var(--color-text-secondary)',
        };
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
      <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
        Execution Log Activity
      </h4>
      <div 
        style={{ 
          border: '1px solid var(--color-border)', 
          borderRadius: 'var(--radius-md)', 
          backgroundColor: 'var(--color-bg-secondary)', 
          maxHeight: '350px', 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          boxSizing: 'border-box'
        }}
      >
        {logs.length === 0 ? (
          <div style={{ padding: 'var(--spacing-4)', textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
            Waiting for run execution logs to start...
          </div>
        ) : (
          logs.map((entry, index) => {
            const colors = getLogColors(entry);
            const isExpanded = !!expandedLogs[index];
            const hasDetails = entry.inputs !== undefined || entry.output !== undefined || entry.error !== undefined || entry.failurePolicy !== undefined;

            return (
              <div 
                key={index} 
                style={{ 
                  padding: 'var(--spacing-3)', 
                  borderBottom: index === logs.length - 1 ? 'none' : '1px solid var(--color-border)',
                  backgroundColor: entry.type === 'run_complete' || entry.type === 'run_start' ? colors.bg : 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--spacing-2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--spacing-4)' }}>
                  <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center', flex: 1 }}>
                    <span 
                      style={{ 
                        fontSize: '9px', 
                        fontFamily: 'monospace', 
                        color: 'var(--color-text-tertiary)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        padding: '1px 4px',
                        borderRadius: 'var(--radius-sm)',
                        flexShrink: 0
                      }}
                    >
                      {formatTime(entry.timestamp)}
                    </span>
                    <span 
                      style={{ 
                        fontSize: 'var(--font-size-xs)', 
                        fontWeight: entry.type === 'run_complete' || entry.type === 'run_start' ? 'bold' : 'normal',
                        color: entry.level === 'error' ? 'var(--color-error)' : entry.level === 'warn' ? 'var(--color-warning)' : 'var(--color-text-primary)'
                      }}
                    >
                      {entry.message}
                    </span>
                  </div>
                  {hasDetails && (
                    <button
                      onClick={() => toggleExpand(index)}
                      className="ft-btn ft-btn-secondary"
                      style={{ 
                        fontSize: '8px', 
                        padding: '2px 6px', 
                        height: 'auto', 
                        minHeight: '0',
                        borderRadius: 'var(--radius-sm)',
                        flexShrink: 0
                      }}
                    >
                      {isExpanded ? 'Hide Details' : 'Show Details'}
                    </button>
                  )}
                </div>

                {isExpanded && hasDetails && (
                  <div 
                    style={{ 
                      marginTop: 'var(--spacing-1)', 
                      padding: 'var(--spacing-3)', 
                      backgroundColor: 'var(--color-bg-tertiary)', 
                      borderRadius: 'var(--radius-md)', 
                      border: `1px solid ${colors.border}`,
                      fontSize: 'var(--font-size-xs)',
                      fontFamily: 'monospace',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacing-2)',
                      overflowX: 'auto'
                    }}
                  >
                    {entry.action && (
                      <div>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Action:</strong> {entry.action}
                      </div>
                    )}
                    {entry.inputs !== undefined && (
                      <div>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Resolved Inputs:</strong>
                        <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(entry.inputs, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.output !== undefined && (
                      <div>
                        <strong style={{ color: 'var(--color-text-secondary)' }}>Step Output:</strong>
                        <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--color-success)' }}>
                          {JSON.stringify(entry.output, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.error && (
                      <div>
                        <strong style={{ color: 'var(--color-error)' }}>Error Message:</strong>
                        <div style={{ color: 'var(--color-error)', marginTop: '2px' }}>
                          {entry.error}
                        </div>
                      </div>
                    )}
                    {entry.failurePolicy && (
                      <div>
                        <strong style={{ color: 'var(--color-warning)' }}>Failure Recovery Action:</strong>
                        <div style={{ marginTop: '2px' }}>
                          Applied Policy: <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{entry.failurePolicy.action}</span>
                          {entry.failurePolicy.redirectTargetId && (
                            <span> &rarr; Redirected to: <code>{entry.failurePolicy.redirectTargetId}</code></span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
