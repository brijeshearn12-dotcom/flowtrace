import React from 'react';
import { Workflow } from '../../shared/ir';

interface PatchDiffProps {
  base: Workflow | null;
  updated: Workflow | null;
}

interface DiffChange {
  type: 'node_add' | 'node_remove' | 'node_update' | 'edge_add' | 'edge_remove';
  id: string;
  label?: string;
  details?: string[];
}

export const computeDiff = (base: Workflow | null, updated: Workflow | null): DiffChange[] => {
  if (!base || !updated) return [];
  const diffs: DiffChange[] = [];

  // 1. Node changes
  // Find added nodes
  updated.nodes.forEach((updatedNode) => {
    const baseNode = base.nodes.find(n => n.id === updatedNode.id);
    if (!baseNode) {
      diffs.push({
        type: 'node_add',
        id: updatedNode.id,
        label: updatedNode.name || updatedNode.id,
        details: [
          `Type: ${updatedNode.type}`,
          `Action: ${updatedNode.action}`,
          `Inputs: ${JSON.stringify(updatedNode.inputs)}`
        ]
      });
    }
  });

  // Find removed nodes
  base.nodes.forEach((baseNode) => {
    const updatedNode = updated.nodes.find(n => n.id === baseNode.id);
    if (!updatedNode) {
      diffs.push({
        type: 'node_remove',
        id: baseNode.id,
        label: baseNode.name || baseNode.id,
        details: [
          `Type: ${baseNode.type}`,
          `Action: ${baseNode.action}`
        ]
      });
    }
  });

  // Find updated nodes
  updated.nodes.forEach((updatedNode) => {
    const baseNode = base.nodes.find(n => n.id === updatedNode.id);
    if (baseNode) {
      const details: string[] = [];
      if (baseNode.name !== updatedNode.name) {
        details.push(`Label: "${baseNode.name}" → "${updatedNode.name}"`);
      }
      if (baseNode.action !== updatedNode.action) {
        details.push(`Action: "${baseNode.action}" → "${updatedNode.action}"`);
      }
      if (JSON.stringify(baseNode.inputs) !== JSON.stringify(updatedNode.inputs)) {
        details.push(`Inputs changed`);
      }
      if (JSON.stringify(baseNode.condition) !== JSON.stringify(updatedNode.condition)) {
        details.push(`Condition: ${JSON.stringify(baseNode.condition || 'None')} → ${JSON.stringify(updatedNode.condition || 'None')}`);
      }
      if (JSON.stringify(baseNode.failurePolicy) !== JSON.stringify(updatedNode.failurePolicy)) {
        details.push(`Failure Policy: ${JSON.stringify(baseNode.failurePolicy || 'None')} → ${JSON.stringify(updatedNode.failurePolicy || 'None')}`);
      }

      if (details.length > 0) {
        diffs.push({
          type: 'node_update',
          id: updatedNode.id,
          label: updatedNode.name || updatedNode.id,
          details
        });
      }
    }
  });

  // 2. Edge changes
  // Find added edges
  updated.edges.forEach((updatedEdge) => {
    const baseEdge = base.edges.find(e => e.id === updatedEdge.id || (e.source === updatedEdge.source && e.target === updatedEdge.target));
    if (!baseEdge) {
      diffs.push({
        type: 'edge_add',
        id: updatedEdge.id || `${updatedEdge.source}->${updatedEdge.target}`,
        label: `${updatedEdge.source} ➔ ${updatedEdge.target}`,
        details: updatedEdge.condition ? [`Condition: ${JSON.stringify(updatedEdge.condition)}`] : []
      });
    }
  });

  // Find removed edges
  base.edges.forEach((baseEdge) => {
    const updatedEdge = updated.edges.find(e => e.id === baseEdge.id || (e.source === baseEdge.source && e.target === baseEdge.target));
    if (!updatedEdge) {
      diffs.push({
        type: 'edge_remove',
        id: baseEdge.id || `${baseEdge.source}->${baseEdge.target}`,
        label: `${baseEdge.source} ➔ ${baseEdge.target}`
      });
    }
  });

  return diffs;
};

export const PatchDiff: React.FC<PatchDiffProps> = ({ base, updated }) => {
  const diffs = computeDiff(base, updated);

  return (
    <div className="ft-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', boxSizing: 'border-box' }}>
      <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-2)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
          Draft Sandbox Diff Preview
        </h3>
        <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
          Review the comparison with the base published configuration.
        </span>
      </div>

      {diffs.length === 0 ? (
        <div style={{ padding: 'var(--spacing-4)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)', fontStyle: 'italic' }}>
          No changes. Sandbox copy matches base version.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', maxHeight: '300px', overflowY: 'auto' }}>
          {diffs.map((diff, idx) => {
            let badgeClass = 'ft-badge-warning';
            let badgeText = 'UPDATED';
            if (diff.type === 'node_add' || diff.type === 'edge_add') {
              badgeClass = 'ft-badge-success';
              badgeText = 'ADDED';
            } else if (diff.type === 'node_remove' || diff.type === 'edge_remove') {
              badgeClass = 'ft-badge-error';
              badgeText = 'REMOVED';
            }

            return (
              <div 
                key={idx} 
                style={{ 
                  padding: 'var(--spacing-2) var(--spacing-3)', 
                  borderRadius: 'var(--radius-sm)', 
                  backgroundColor: 'var(--color-bg-tertiary)', 
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    {diff.label} <code style={{ fontSize: '10px', fontWeight: 'normal', color: 'var(--color-text-tertiary)' }}>({diff.id})</code>
                  </span>
                  <span className={`ft-badge ${badgeClass}`} style={{ fontSize: '8px', padding: '1px 4px' }}>
                    {badgeText}
                  </span>
                </div>
                {diff.details && diff.details.length > 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', paddingLeft: '8px', borderLeft: '2px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {diff.details.map((detail, dIdx) => (
                      <span key={dIdx} style={{ fontFamily: 'monospace' }}>{detail}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
