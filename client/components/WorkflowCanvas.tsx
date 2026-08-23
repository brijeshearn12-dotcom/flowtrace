import React, { useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  Node as RFNode,
  Edge as RFEdge,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Workflow, Node as FTNode } from '../../shared/ir';
import dagre from 'dagre';

interface WorkflowNodeData {
  node: FTNode;
  status?: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
}

const CustomWorkflowNode: React.FC<{ data: WorkflowNodeData }> = ({ data }) => {
  const { node, status } = data;

  let statusBadgeClass = 'ft-badge-warning';
  let borderStyle = '1px solid var(--color-border)';
  let bgStyle = 'var(--color-bg-secondary)';

  if (status === 'success') {
    statusBadgeClass = 'ft-badge-success';
    borderStyle = '2px solid var(--color-success)';
    bgStyle = '#f0fdf4';
  } else if (status === 'failed') {
    statusBadgeClass = 'ft-badge-error';
    borderStyle = '2px solid var(--color-error)';
    bgStyle = '#fef2f2';
  } else if (status === 'running') {
    statusBadgeClass = 'ft-badge-running';
    borderStyle = '2px solid var(--color-running)';
    bgStyle = '#f0f9ff';
  } else if (status === 'skipped') {
    statusBadgeClass = 'ft-badge-warning';
    borderStyle = '1px dashed var(--color-warning)';
    bgStyle = '#fffbeb';
  }

  return (
    <div 
      className="ft-card"
      style={{
        padding: 'var(--spacing-3)',
        borderRadius: 'var(--radius-md)',
        border: borderStyle,
        backgroundColor: bgStyle,
        width: '180px',
        fontSize: 'var(--font-size-xs)',
        fontFamily: 'var(--font-family)',
        color: 'var(--color-text-primary)',
        position: 'relative',
        boxSizing: 'border-box'
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--color-text-tertiary)', width: '6px', height: '6px' }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-2)' }}>
        <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
          {node.type}
        </span>
        {status && (
          <span className={`ft-badge ${statusBadgeClass}`} style={{ fontSize: '8px', padding: '1px 4px' }}>
            {status}
          </span>
        )}
      </div>

      <div style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-1)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.name}
      </div>

      <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', backgroundColor: 'var(--color-bg-tertiary)', padding: '2px 4px', borderRadius: 'var(--radius-sm)' }}>
        {node.action || 'Manual'}
      </div>

      <div style={{ display: 'flex', gap: '4px', marginTop: 'var(--spacing-2)', flexWrap: 'wrap' }}>
        {node.condition && (
          <span 
            className="ft-badge" 
            style={{ 
              backgroundColor: 'var(--color-brand-light)', 
              color: 'var(--color-brand)', 
              fontSize: '8px', 
              padding: '1px 4px', 
              border: 'none', 
              textTransform: 'none' 
            }}
          >
            if: {node.condition.operator}
          </span>
        )}
        {node.failurePolicy && (
          <span 
            className="ft-badge" 
            style={{ 
              backgroundColor: '#fee2e2', 
              color: '#991b1b', 
              fontSize: '8px', 
              padding: '1px 4px', 
              border: 'none', 
              textTransform: 'none' 
            }}
          >
            on_fail: {node.failurePolicy.action}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--color-text-tertiary)', width: '6px', height: '6px' }} />
    </div>
  );
};

const nodeTypes = {
  workflowNode: CustomWorkflowNode,
};

const FitViewUpdater: React.FC<{ nodes: RFNode[]; workflowId: string }> = ({ nodes, workflowId }) => {
  const { fitView } = useReactFlow();
  const lastWorkflowId = React.useRef<string>('');

  useEffect(() => {
    if (nodes.length === 0) return;
    if (lastWorkflowId.current === workflowId) return;

    lastWorkflowId.current = workflowId;
    let retry = 0;
    const timers: any[] = [];

    const tryFitView = () => {
      const container = document.querySelector('.react-flow');
      const width = container?.clientWidth || 0;
      const height = container?.clientHeight || 0;

      if ((width === 0 || height === 0) && retry < 20) {
        retry += 1;
        timers.push(setTimeout(tryFitView, 100));
      } else {
        fitView({ padding: 0.2 });
        // Double-fit after rendering to ensure nodes are measured and laid out correctly
        timers.push(setTimeout(() => fitView({ padding: 0.2 }), 200));
        timers.push(setTimeout(() => fitView({ padding: 0.2 }), 500));
      }
    };

    timers.push(setTimeout(tryFitView, 100));
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [nodes.length, workflowId, fitView]);
  return null;
};

const getLayoutedElements = (nodes: RFNode[], edges: RFEdge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 220, height: 120 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - 110,
        y: nodeWithPosition.y - 60,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

interface WorkflowCanvasProps {
  workflow: Workflow;
  stepStatuses?: Record<string, 'pending' | 'running' | 'success' | 'failed' | 'skipped'>;
  onNodeSelect?: (node: FTNode | null) => void;
}

const EMPTY_STATUSES: Record<string, any> = {};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ workflow, stepStatuses = EMPTY_STATUSES, onNodeSelect }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onNodeClick = (_event: React.MouseEvent, rfNode: RFNode) => {
    if (onNodeSelect) {
      if (rfNode.id === workflow.trigger.id) {
        onNodeSelect({
          id: workflow.trigger.id,
          name: 'Manual Trigger',
          type: 'form',
          action: 'trigger',
          inputs: workflow.trigger.schema as Record<string, unknown> || {},
        } as FTNode);
      } else {
        const ftNode = workflow.nodes.find((n) => n.id === rfNode.id);
        if (ftNode) {
          onNodeSelect(ftNode);
        }
      }
    }
  };

  useEffect(() => {
    // 1. Map trigger to a root node
    const triggerNode: RFNode = {
      id: workflow.trigger.id,
      type: 'workflowNode',
      data: {
        node: {
          id: workflow.trigger.id,
          name: 'Manual Trigger',
          type: 'form',
          action: 'trigger',
          inputs: {},
        } as FTNode,
        status: stepStatuses[workflow.trigger.id] || 'success', // trigger is always success once run starts
      },
      position: { x: 0, y: 0 },
    };

    // 2. Map other nodes
    const otherNodes: RFNode[] = workflow.nodes.map((node) => ({
      id: node.id,
      type: 'workflowNode',
      data: {
        node,
        status: stepStatuses[node.id],
      },
      position: { x: 0, y: 0 },
    }));

    const rawNodes = [triggerNode, ...otherNodes];

    // 3. Map edges
    // Find first nodes that transition from trigger
    // If there is no explicit edge from trigger, we find root nodes (nodes with no incoming edges) and connect them
    const targetEdgeIds = new Set(workflow.edges.map((e) => e.target));
    const rootNodes = workflow.nodes.filter((n) => !targetEdgeIds.has(n.id));

    const triggerEdges: RFEdge[] = rootNodes.map((rn) => ({
      id: `edge-${workflow.trigger.id}-${rn.id}`,
      source: workflow.trigger.id,
      target: rn.id,
      animated: true,
      style: { stroke: 'var(--color-text-secondary)', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--color-text-secondary)',
      },
    }));

    const otherEdges: RFEdge[] = workflow.edges.map((edge) => {
      const isConditional = edge.condition !== undefined;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: isConditional ? edge.condition?.operator : undefined,
        labelStyle: { fill: 'var(--color-brand)', fontSize: 10, fontWeight: 'bold' },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: 'var(--color-brand-light)', color: 'var(--color-brand)' },
        animated: isConditional || stepStatuses[edge.source] === 'running',
        style: {
          stroke: isConditional ? 'var(--color-brand)' : 'var(--color-text-secondary)',
          strokeWidth: isConditional ? 2 : 1.5,
          strokeDasharray: isConditional ? '4 4' : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConditional ? 'var(--color-brand)' : 'var(--color-text-secondary)',
        },
      };
    });

    const rawEdges = [...triggerEdges, ...otherEdges];

    // 4. Calculate layout using Dagre
    const layouted = getLayoutedElements(rawNodes, rawEdges, 'LR');
    console.log('[WorkflowCanvas] Setting nodes:', rawNodes.map(n => n.id), 'edges:', rawEdges.map(e => e.id));
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [workflow, stepStatuses, setNodes, setEdges]);

  return (
    <ReactFlowProvider>
      <div style={{ width: '100%', height: '500px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-primary)', overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.5}
          maxZoom={1.5}
        >
          <Background color="var(--color-border)" gap={16} />
          <Controls />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
          <FitViewUpdater nodes={nodes} workflowId={workflow.id} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
};
