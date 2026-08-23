import React, { useEffect, useState } from 'react';
import { Trigger, Node, Edge } from '../../shared/ir';

export interface VersionItem {
  id: string;
  workflowId: string;
  version: number;
  trigger: Trigger;
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
  source?: 'manual' | 'agent';
  summary?: string;
}

interface VersionHistoryProps {
  workflowId: string;
  currentVersion: number;
  publishedVersionId: string | null;
  workflowStatus: string;
  onSelectVersion: (versionNumber: number) => void;
  refreshTrigger?: number;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  workflowId,
  currentVersion,
  publishedVersionId,
  workflowStatus,
  onSelectVersion,
  refreshTrigger = 0
}) => {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/workflows/${workflowId}/history`);
        if (!res.ok) {
          throw new Error(`Failed to load version history: status ${res.status}`);
        }
        const data = await res.json();
        setVersions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [workflowId, refreshTrigger]);

  const getVersionStatus = (version: VersionItem) => {
    if (version.id === publishedVersionId) {
      return 'published';
    }
    const isLatest = versions.length > 0 && version.version === Math.max(...versions.map(v => v.version));
    if (isLatest && workflowStatus === 'draft') {
      return 'draft';
    }
    return 'historical';
  };

  return (
    <div className="ft-card" style={{ backgroundColor: 'var(--color-bg-secondary)', padding: 'var(--spacing-4)', marginTop: 'var(--spacing-4)' }}>
      <h3 style={{ margin: '0 0 var(--spacing-4) 0', fontSize: 'var(--font-size-md)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
        Version History
      </h3>
      {loading && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Loading history...</div>}
      {error && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>Error: {error}</div>}
      {!loading && !error && versions.length === 0 && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>No versions found.</div>
      )}
      {!loading && !error && versions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', maxHeight: '350px', overflowY: 'auto' }}>
          {versions.map((ver) => {
            const status = getVersionStatus(ver);
            const isSelected = ver.version === currentVersion;
            return (
              <div
                key={ver.id}
                onClick={() => onSelectVersion(ver.version)}
                style={{
                  padding: 'var(--spacing-3)',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected ? '2px solid var(--color-brand)' : '1px solid var(--color-border)',
                  backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-2)', flexWrap: 'wrap', gap: 'var(--spacing-1)' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                    Version {ver.version}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--spacing-1)', alignItems: 'center' }}>
                    <span className={`ft-badge ${
                      status === 'published' ? 'ft-badge-success' :
                      status === 'draft' ? 'ft-badge-warning' : 'ft-badge-neutral'
                    }`} style={{ 
                      fontSize: '10px', 
                      padding: '2px 6px',
                      textTransform: 'uppercase',
                      backgroundColor: status === 'historical' ? 'var(--color-bg-tertiary)' : undefined,
                      color: status === 'historical' ? 'var(--color-text-secondary)' : undefined,
                      border: status === 'historical' ? '1px solid var(--color-border)' : undefined
                    }}>
                      {status}
                    </span>
                    {ver.source && (
                      <span className="ft-badge" style={{ 
                        fontSize: '10px', 
                        padding: '2px 6px',
                        textTransform: 'uppercase',
                        backgroundColor: ver.source === 'agent' ? 'var(--color-brand-light)' : 'var(--color-bg-tertiary)',
                        color: ver.source === 'agent' ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)'
                      }}>
                        {ver.source}
                      </span>
                    )}
                  </div>
                </div>
                {ver.summary && (
                  <p style={{ margin: '0 0 var(--spacing-2) 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    {ver.summary}
                  </p>
                )}
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  {new Date(ver.createdAt).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
