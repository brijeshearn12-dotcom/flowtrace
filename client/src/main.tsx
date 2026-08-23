import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/tokens.css';
import { WorkflowHome } from '../pages/WorkflowHome';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { NodeInspector } from '../components/NodeInspector';
import { TriggerPanel } from '../components/TriggerPanel';
import { RunOverlay } from '../components/RunOverlay';
import { PatchDiff } from '../components/PatchDiff';
import { VersionHistory } from '../components/VersionHistory';
import { Workflow, Node } from '../../shared/ir';
import { validateWorkflow } from '../../shared/validator';


const App = () => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [loadingWorkflow, setLoadingWorkflow] = useState<boolean>(false);
  const [errorWorkflow, setErrorWorkflow] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState<Workflow | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [stepStatuses, setStepStatuses] = useState<Record<string, 'pending' | 'running' | 'success' | 'failed' | 'skipped'>>({});

  const handleStepStatusesChange = useCallback(
    (statuses: Record<string, 'pending' | 'running' | 'success' | 'failed' | 'skipped'>) => {
      setStepStatuses(statuses);
    },
    []
  );

  // Draft and edit states
  const [localDraft, setLocalDraft] = useState<Workflow | null>(null);
  const [viewMode, setViewMode] = useState<'published' | 'draft'>('published');
  const [saving, setSaving] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [latestVersionNumber, setLatestVersionNumber] = useState<number | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleBack = () => {
    setSelectedWorkflowId(null);
    setSelectedWorkflow(null);
    setLocalDraft(null);
    setActiveDraft(null);
    setErrorWorkflow(null);
    setSelectedNode(null);
    setActiveRunId(null);
    setStepStatuses({});
    setViewMode('published');
    setSaveError(null);
    setPublishError(null);
    setIsApproved(false);
    setLatestVersionNumber(null);
    setSuccessMessage(null);
  };

  useEffect(() => {
    if (!selectedWorkflowId) return;

    setLoadingWorkflow(true);
    setErrorWorkflow(null);
    setSelectedWorkflow(null);
    setLocalDraft(null);
    setSelectedNode(null);
    setActiveRunId(null);
    setStepStatuses({});
    setViewMode('published');
    setSaveError(null);
    setPublishError(null);
    setIsApproved(false);
    setLatestVersionNumber(null);

    fetch(`/api/workflows/${selectedWorkflowId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch workflow: status ${res.status}`);
        }
        return res.json();
      })
      .then((data: Workflow) => {
        setSelectedWorkflow(data);
        setLocalDraft(data);
        setLatestVersionNumber(data.version);
        setViewMode(data.status === 'published' ? 'published' : 'draft');
      })
      .catch((err) => {
        setErrorWorkflow(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoadingWorkflow(false);
      });
  }, [selectedWorkflowId]);

  // Helper to generate JSON Patch operations between base and updated workflows
  const generatePatch = (base: Workflow, updated: Workflow) => {
    const patches: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }> = [];

    // Compare trigger
    if (JSON.stringify(base.trigger) !== JSON.stringify(updated.trigger)) {
      patches.push({
        op: 'replace',
        path: '/trigger',
        value: updated.trigger
      });
    }

    // Compare nodes
    base.nodes.forEach((baseNode, idx) => {
      const updatedNode = updated.nodes.find(n => n.id === baseNode.id);
      if (!updatedNode) {
        patches.push({
          op: 'remove',
          path: `/nodes/${idx}`
        });
      } else {
        if (baseNode.name !== updatedNode.name) {
          patches.push({ op: 'replace', path: `/nodes/${idx}/name`, value: updatedNode.name });
        }
        if (baseNode.action !== updatedNode.action) {
          patches.push({ op: 'replace', path: `/nodes/${idx}/action`, value: updatedNode.action });
        }
        if (JSON.stringify(baseNode.inputs) !== JSON.stringify(updatedNode.inputs)) {
          patches.push({ op: 'replace', path: `/nodes/${idx}/inputs`, value: updatedNode.inputs });
        }
        if (JSON.stringify(baseNode.condition) !== JSON.stringify(updatedNode.condition)) {
          if (updatedNode.condition === undefined) {
            patches.push({ op: 'remove', path: `/nodes/${idx}/condition` });
          } else {
            patches.push({ op: 'replace', path: `/nodes/${idx}/condition`, value: updatedNode.condition });
          }
        }
        if (JSON.stringify(baseNode.failurePolicy) !== JSON.stringify(updatedNode.failurePolicy)) {
          if (updatedNode.failurePolicy === undefined) {
            patches.push({ op: 'remove', path: `/nodes/${idx}/failurePolicy` });
          } else {
            patches.push({ op: 'replace', path: `/nodes/${idx}/failurePolicy`, value: updatedNode.failurePolicy });
          }
        }
      }
    });

    // Check for newly added nodes
    updated.nodes.forEach((updatedNode) => {
      const exists = base.nodes.some(n => n.id === updatedNode.id);
      if (!exists) {
        patches.push({
          op: 'add',
          path: '/nodes/-',
          value: updatedNode
        });
      }
    });

    // Compare edges
    if (JSON.stringify(base.edges) !== JSON.stringify(updated.edges)) {
      patches.push({
        op: 'replace',
        path: '/edges',
        value: updated.edges
      });
    }

    return patches;
  };

  const hasUnsavedChanges = selectedWorkflow && localDraft
    ? JSON.stringify(selectedWorkflow.nodes) !== JSON.stringify(localDraft.nodes) ||
      JSON.stringify(selectedWorkflow.trigger) !== JSON.stringify(localDraft.trigger) ||
      JSON.stringify(selectedWorkflow.edges) !== JSON.stringify(localDraft.edges)
    : false;

  const handleSaveDraft = async () => {
    if (!selectedWorkflow || !localDraft) return;
    setSaving(true);
    setSaveError(null);

    const patches = generatePatch(selectedWorkflow, localDraft);
    if (patches.length === 0) {
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}?baseVersion=${selectedWorkflow.version}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patches),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Save failed: status ${res.status}`);
      }

      // Re-fetch the workflow at the new draft version
      const fetchRes = await fetch(`/api/workflows/${selectedWorkflow.id}?version=${selectedWorkflow.version + 1}`);
      if (!fetchRes.ok) {
        throw new Error(`Failed to load saved draft version: status ${fetchRes.status}`);
      }
      const newWf = await fetchRes.json();
      setSelectedWorkflow(newWf);
      setLocalDraft(newWf);
      setLatestVersionNumber(newWf.version);
      setViewMode('draft');
      setIsApproved(false);
      setHistoryRefreshTrigger(prev => prev + 1);
      setSuccessMessage(`Draft version ${newWf.version} saved successfully!`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePublishWorkflow = async () => {
    if (!selectedWorkflow) return;
    setPublishing(true);
    setPublishError(null);

    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}/publish?baseVersion=${selectedWorkflow.version}`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Publish failed: status ${res.status}`);
      }

      // Re-fetch workflow latest version
      const fetchRes = await fetch(`/api/workflows/${selectedWorkflow.id}`);
      if (!fetchRes.ok) {
        throw new Error(`Failed to reload workflow: status ${fetchRes.status}`);
      }
      const newWf = await fetchRes.json();
      setSelectedWorkflow(newWf);
      setLocalDraft(newWf);
      setLatestVersionNumber(newWf.version);
      setViewMode('published');
      setIsApproved(false);
      setHistoryRefreshTrigger(prev => prev + 1);
      setSuccessMessage(`Workflow version ${newWf.version} published successfully!`);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const handleUpdateNode = (updatedNode: Node) => {
    if (!localDraft) return;
    const updatedNodes = localDraft.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n));
    setLocalDraft({
      ...localDraft,
      nodes: updatedNodes,
    });

    if (selectedNode && selectedNode.id === updatedNode.id) {
      setSelectedNode(updatedNode);
    }
  };

  const handleDiscardChanges = () => {
    setLocalDraft(selectedWorkflow);
    setIsApproved(false);
  };

  const handleSelectVersion = async (versionNumber: number) => {
    if (selectedWorkflowId) {
      setLoadingWorkflow(true);
      setErrorWorkflow(null);
      setSelectedNode(null);

      try {
        const res = await fetch(`/api/workflows/${selectedWorkflowId}?version=${versionNumber}`);
        if (!res.ok) {
          throw new Error(`Failed to load workflow version ${versionNumber}: status ${res.status}`);
        }
        const data: Workflow = await res.json();
        setSelectedWorkflow(data);
        
        if (versionNumber === latestVersionNumber) {
          setViewMode(data.status === 'published' ? 'published' : 'draft');
        } else {
          setViewMode('published');
        }
      } catch (err) {
        setErrorWorkflow(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingWorkflow(false);
      }
    }
  };

  const validation = viewMode === 'draft' && localDraft
    ? validateWorkflow(localDraft)
    : { success: true, errors: [] as Array<{ path: string; message: string }> };

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
        {successMessage && (
          <div style={{ maxWidth: '1200px', margin: 'var(--spacing-4) auto 0 auto', padding: '0 var(--spacing-6)' }}>
            <div className="ft-alert ft-alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                <span>✅</span>
                <strong>{successMessage}</strong>
              </div>
              <button 
                onClick={() => setSuccessMessage(null)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'var(--font-size-base)', fontWeight: 'bold' }}
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {!selectedWorkflowId && !activeDraft ? (
          <WorkflowHome 
            onSelectWorkflow={(id) => setSelectedWorkflowId(id)}
            onDraftGenerated={(draft) => {
              setActiveDraft(draft);
              setSuccessMessage('Draft generated and loaded into interactive sandbox.');
            }}
          />
        ) : activeDraft ? (
          <div style={{ padding: 'var(--spacing-6)', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
            <div className="ft-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
                <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)', margin: 0 }}>
                  Active NLP Detected Draft: <span style={{ color: 'var(--color-brand)' }}>{activeDraft.id}</span>
                </h2>
                <span className="ft-badge ft-badge-warning">Draft</span>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-6) 0' }}>
                This workflow definition was generated from your requirement string. You can inspect its configuration and interact with its visual graph representation.
              </p>

              {/* Render visual graph canvas and Node inspector side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--spacing-6)', marginBottom: 'var(--spacing-6)' }}>
                <div style={{ flex: 1, minWidth: '350px' }}>
                  <WorkflowCanvas workflow={activeDraft} onNodeSelect={(node) => setSelectedNode(node)} />
                </div>
                <div style={{ width: '100%' }}>
                  <NodeInspector node={selectedNode} onClose={() => setSelectedNode(null)} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-4)' }}>
                <button className="ft-btn ft-btn-secondary" onClick={handleBack}>
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 'var(--spacing-6)', maxWidth: '1200px', margin: '0 auto' }}>
            {loadingWorkflow && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-12)', gap: 'var(--spacing-4)' }}>
                <div className="ft-spinner"></div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>
                  Loading workflow details...
                </div>
              </div>
            )}

            {errorWorkflow && (
              <div className="ft-card" style={{ borderColor: 'var(--color-error-border)', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                  <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)' }}>Error Loading Workflow</h3>
                </div>
                <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{errorWorkflow}</p>
                <div>
                  <button className="ft-btn ft-btn-secondary" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error-border)', fontWeight: 'var(--font-weight-medium)' }} onClick={() => setSelectedWorkflowId(selectedWorkflowId)}>
                    🔄 Retry Loading
                  </button>
                </div>
              </div>
            )}

            {selectedWorkflow && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
                <div className="ft-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                      <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)', margin: 0 }}>
                        Selected Workflow: <span style={{ color: 'var(--color-brand)' }}>{selectedWorkflow.id}</span>
                      </h2>
                      {viewMode === 'published' ? (
                        <span className="ft-badge ft-badge-success">Published</span>
                      ) : (
                        <span className="ft-badge ft-badge-warning">Draft Sandbox</span>
                      )}
                      {hasUnsavedChanges && (
                        <span className="ft-badge ft-badge-error">Unsaved Changes</span>
                      )}
                    </div>
                    <span className={`ft-badge ${selectedWorkflow.status === 'published' ? 'ft-badge-success' : 'ft-badge-warning'}`}>
                      Db State: {selectedWorkflow.status}
                    </span>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-6) 0' }}>
                    {viewMode === 'published' ? (
                      <>Viewing immutable published version <strong>{selectedWorkflow.version}</strong> | Created: {new Date(selectedWorkflow.createdAt).toLocaleString()}</>
                    ) : (
                      <>Editing draft sandbox based on version <strong>{selectedWorkflow.version}</strong></>
                    )}
                  </p>

                  {/* ViewMode Tabs (Only show if workflow is published at least once and we are on the latest version) */}
                  {selectedWorkflow.status === 'published' && selectedWorkflow.version === latestVersionNumber ? (
                    <div style={{ display: 'flex', gap: 'var(--spacing-2)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-3)', marginBottom: 'var(--spacing-6)' }}>
                      <button 
                        className={`ft-btn ${viewMode === 'published' ? 'ft-btn-primary' : 'ft-btn-secondary'}`}
                        onClick={() => {
                          if (hasUnsavedChanges) {
                            if (!confirm('You have unsaved changes. Switching to the published version will discard your draft edits. Proceed?')) {
                              return;
                            }
                          }
                          setViewMode('published');
                          setLocalDraft(selectedWorkflow);
                        }}
                        style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)' }}
                      >
                        Published Version ({selectedWorkflow.version})
                      </button>
                      <button 
                        className={`ft-btn ${viewMode === 'draft' ? 'ft-btn-primary' : 'ft-btn-secondary'}`}
                        onClick={() => setViewMode('draft')}
                        style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)' }}
                      >
                        Draft Sandbox
                      </button>
                    </div>
                  ) : selectedWorkflow.version !== latestVersionNumber ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-3)', marginBottom: 'var(--spacing-6)' }}>
                      <span className="ft-badge ft-badge-warning" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                        Read-Only Inspection
                      </span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        Viewing historical <strong>Version {selectedWorkflow.version}</strong>. Editing is disabled. Select the latest version in the history panel to edit.
                      </span>
                    </div>
                  ) : null}

                  {/* Render visual graph canvas and Node inspector side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--spacing-6)', marginBottom: 'var(--spacing-6)' }}>
                    <div style={{ flex: 1, minWidth: '350px' }}>
                      <WorkflowCanvas 
                        workflow={viewMode === 'draft' && localDraft ? localDraft : selectedWorkflow} 
                        stepStatuses={stepStatuses} 
                        onNodeSelect={(node) => setSelectedNode(node)} 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)', width: '100%' }}>
                      {viewMode === 'published' ? (
                        <TriggerPanel workflow={selectedWorkflow} onRunSuccess={(runId) => setActiveRunId(runId)} />
                      ) : (
                        <div className="ft-card" style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', boxSizing: 'border-box' }}>
                          <h3 style={{ margin: '0 0 var(--spacing-2) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'bold' }}>Trigger Manual Run</h3>
                          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                            Manual execution is disabled in the Draft Sandbox. Switch back to the &apos;Published Version&apos; tab to execute a run.
                          </p>
                        </div>
                      )}
                      <NodeInspector 
                        node={selectedNode 
                          ? (viewMode === 'draft' && localDraft
                              ? localDraft.nodes.find(n => n.id === selectedNode.id) || selectedNode
                              : selectedWorkflow.nodes.find(n => n.id === selectedNode.id) || selectedNode)
                          : null
                        } 
                        workflow={viewMode === 'draft' && localDraft ? localDraft : selectedWorkflow}
                        isEditable={viewMode === 'draft'}
                        onUpdateNode={handleUpdateNode}
                        onClose={() => setSelectedNode(null)} 
                      />
                      {viewMode === 'draft' && (
                        <PatchDiff base={selectedWorkflow} updated={localDraft} />
                      )}
                      <VersionHistory
                        workflowId={selectedWorkflow.id}
                        currentVersion={selectedWorkflow.version}
                        publishedVersionId={selectedWorkflow.publishedVersionId || null}
                        workflowStatus={selectedWorkflow.status}
                        onSelectVersion={handleSelectVersion}
                        refreshTrigger={historyRefreshTrigger}
                      />
                    </div>
                  </div>

                  {saveError && (
                    <div style={{ padding: 'var(--spacing-3)', marginBottom: 'var(--spacing-4)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)' }}>
                      <strong>Save Error:</strong> {saveError}
                    </div>
                  )}

                  {publishError && (
                    <div style={{ padding: 'var(--spacing-3)', marginBottom: 'var(--spacing-4)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)' }}>
                      <strong>Publish Error:</strong> {publishError}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', width: '100%', marginTop: 'var(--spacing-4)' }}>
                    {/* Validation Error List */}
                    {viewMode === 'draft' && !validation.success && (
                      <div style={{ padding: 'var(--spacing-4)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}>
                        <h4 style={{ margin: '0 0 var(--spacing-2) 0', fontSize: 'var(--font-size-sm)', fontWeight: 'bold' }}>Validation Blockers:</h4>
                        <ul style={{ margin: 0, paddingLeft: 'var(--spacing-4)', fontSize: 'var(--font-size-xs)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
                          {validation.errors.map((err, i) => (
                            <li key={i}><strong>{err.path}:</strong> {err.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-4)' }}>
                      <button className="ft-btn ft-btn-secondary" onClick={handleBack}>
                        Back to Dashboard
                      </button>

                      {viewMode === 'draft' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
                          {hasUnsavedChanges ? (
                            <>
                              <button 
                                className="ft-btn ft-btn-secondary" 
                                onClick={handleDiscardChanges}
                                style={{ color: 'var(--color-error)', borderColor: 'var(--color-error-border)' }}
                              >
                                Discard Changes
                              </button>
                              <button 
                                className="ft-btn ft-btn-primary" 
                                onClick={handleSaveDraft}
                                disabled={saving}
                              >
                                {saving ? 'Saving...' : 'Save Draft'}
                              </button>
                            </>
                          ) : (
                            selectedWorkflow.status === 'draft' && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--spacing-2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
                                  {validation.success && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                                      <input 
                                        type="checkbox" 
                                        checked={isApproved} 
                                        onChange={(e) => {
                                          setIsApproved(e.target.checked);
                                        }} 
                                        style={{ cursor: 'pointer' }}
                                      />
                                      Approve draft
                                    </label>
                                  )}
                                  <button 
                                    className="ft-btn ft-btn-primary" 
                                    onClick={handlePublishWorkflow}
                                    disabled={publishing || !validation.success || !isApproved}
                                    style={{ 
                                      backgroundColor: (validation.success && isApproved) ? 'var(--color-success)' : 'var(--color-bg-secondary)', 
                                      borderColor: (validation.success && isApproved) ? 'var(--color-success-border)' : 'var(--color-border)',
                                      color: (validation.success && isApproved) ? 'white' : 'var(--color-text-secondary)',
                                      cursor: (validation.success && isApproved) ? 'pointer' : 'not-allowed'
                                    }}
                                  >
                                    {publishing ? 'Publishing...' : 'Approve & Publish Draft'}
                                  </button>
                                </div>
                                {!validation.success && (
                                  <span style={{ fontSize: '11px', color: 'var(--color-error)', fontStyle: 'italic' }}>
                                    ⚠️ Cannot publish: Resolve validation blockers above first.
                                  </span>
                                )}
                                {validation.success && !isApproved && (
                                  <span style={{ fontSize: '11px', color: 'var(--color-warning)', fontStyle: 'italic' }}>
                                    ⚠️ Check &apos;Approve draft&apos; above to publish.
                                  </span>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeRunId && selectedWorkflow && (
              <RunOverlay 
                runId={activeRunId} 
                workflow={selectedWorkflow} 
                onClose={() => setActiveRunId(null)}
                onStepStatusesChange={handleStepStatusesChange}
              />
            )}
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
