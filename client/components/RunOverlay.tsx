import React, { useState, useEffect } from 'react';
import { Workflow, Run, StepResult } from '../../shared/ir';
import { RunLog, LogEntry } from './RunLog';

interface RunOverlayProps {
  runId: string;
  workflow: Workflow;
  onClose: () => void;
  onStepStatusesChange?: (statuses: Record<string, 'pending' | 'running' | 'success' | 'failed' | 'skipped'>) => void;
}

export const RunOverlay: React.FC<RunOverlayProps> = ({
  runId,
  workflow,
  onClose,
  onStepStatusesChange,
}) => {
  const [run, setRun] = useState<Run | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    let timerId: ReturnType<typeof setTimeout>;

    const fetchRunData = async () => {
      try {
        const [runRes, logsRes] = await Promise.all([
          fetch(`/api/runs/${runId}`),
          fetch(`/api/runs/${runId}/logs`),
        ]);

        if (!runRes.ok || !logsRes.ok) {
          throw new Error('Failed to retrieve run execution progress details from server.');
        }

        const runData = await runRes.json();
        const logsData = await logsRes.json();

        if (!active) return;

        setRun(runData);
        setLogs(logsData.logs || []);
        setError(null);
        setLoading(false);

        // Derive current step statuses and notify parent component
        if (onStepStatusesChange) {
          const stepStatuses: Record<string, 'pending' | 'running' | 'success' | 'failed' | 'skipped'> = {};

          // Initialize all nodes to pending
          workflow.nodes.forEach((n) => {
            stepStatuses[n.id] = 'pending';
          });
          stepStatuses[workflow.trigger.id] = 'success'; // trigger node is always success once running starts

          // Set statuses of completed steps
          if (runData.results) {
            Object.entries(runData.results).forEach(([stepId, result]) => {
              const stepResult = result as StepResult;
              stepStatuses[stepId] = stepResult.status;
            });
          }

          // If a step started but hasn't completed yet, it is 'running'
          const logsList = logsData.logs || [];
          logsList.forEach((log: LogEntry) => {
            if (log.type === 'step_start' && log.stepId) {
              if (!runData.results || !runData.results[log.stepId]) {
                stepStatuses[log.stepId] = 'running';
              }
            }
          });

          onStepStatusesChange(stepStatuses);
        }

        // Stop polling if we reached a terminal run state
        const isTerminal =
          runData.status === 'success' ||
          runData.status === 'failed' ||
          runData.status === 'aborted';

        if (isTerminal) {
          return;
        }

        // Continue polling every 500ms for smooth live updates
        timerId = setTimeout(fetchRunData, 500);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    fetchRunData();

    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, [runId, workflow, onStepStatusesChange]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="ft-badge ft-badge-success">Success</span>;
      case 'failed':
        return <span className="ft-badge ft-badge-error">Failed</span>;
      case 'aborted':
        return <span className="ft-badge ft-badge-error">Aborted</span>;
      case 'running':
        return <span className="ft-badge ft-badge-running">Running</span>;
      default:
        return <span className="ft-badge ft-badge-warning">{status}</span>;
    }
  };

  const getStatusBannerColors = (status: string) => {
    switch (status) {
      case 'success':
        return {
          bg: 'var(--color-success-bg)',
          border: 'var(--color-success-border)',
          color: 'var(--color-success)',
        };
      case 'failed':
      case 'aborted':
        return {
          bg: 'var(--color-error-bg)',
          border: 'var(--color-error-border)',
          color: 'var(--color-error)',
        };
      default:
        return {
          bg: 'var(--color-running-bg)',
          border: 'var(--color-running-border)',
          color: 'var(--color-running)',
        };
    }
  };

  const isTerminal = run ? ['success', 'failed', 'aborted'].includes(run.status) : false;
  const bannerColors = run ? getStatusBannerColors(run.status) : { bg: 'var(--color-bg-tertiary)', border: 'var(--color-border)', color: 'var(--color-text-secondary)' };

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: 'rgba(15, 23, 42, 0.75)', 
        backdropFilter: 'blur(4px)', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        zIndex: 1000,
        padding: 'var(--spacing-6)',
        boxSizing: 'border-box'
      }}
    >
      <div 
        className="ft-card" 
        style={{ 
          width: '100%', 
          maxWidth: '750px', 
          backgroundColor: 'var(--color-bg-secondary)', 
          borderRadius: 'var(--radius-lg)', 
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-4)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
              Live Workflow Run Execution
            </h3>
            <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
              Run ID: {runId}
            </span>
          </div>
          {run && getStatusBadge(run.status)}
        </div>

        {loading && (
          <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Loading run details from execution server...
          </div>
        )}

        {error && (
          <div style={{ padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {run && (
          <>
            <div 
              style={{ 
                padding: 'var(--spacing-3)', 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: bannerColors.bg, 
                border: `1px solid ${bannerColors.border}`, 
                color: bannerColors.color,
                fontSize: 'var(--font-size-xs)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--spacing-2)' }}>
                <div>
                  <strong>Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{run.status}</span>
                </div>
                <div>
                  <strong>Version:</strong> {run.version}
                </div>
                <div>
                  <strong>Started:</strong> {new Date(run.startedAt).toLocaleTimeString()}
                </div>
                {run.completedAt && (
                  <div>
                    <strong>Completed:</strong> {new Date(run.completedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                Trigger Payload Parameters
              </span>
              <pre 
                style={{ 
                  margin: 0, 
                  backgroundColor: 'var(--color-bg-tertiary)', 
                  padding: 'var(--spacing-3)', 
                  borderRadius: 'var(--radius-md)', 
                  fontSize: '11px', 
                  fontFamily: 'monospace', 
                  border: '1px solid var(--color-border)',
                  overflowX: 'auto' 
                }}
              >
                {JSON.stringify(run.triggerPayload, null, 2)}
              </pre>
            </div>

            <RunLog logs={logs} />
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-4)', marginTop: 'var(--spacing-2)' }}>
          <button 
            className="ft-btn ft-btn-primary" 
            onClick={onClose}
            style={{ minWidth: '100px' }}
          >
            {isTerminal ? 'Close' : 'Cancel & Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
