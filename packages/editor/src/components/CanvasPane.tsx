// ---------------------------------------------------------------------------
// CanvasPane — React Flow canvas displaying the .qalam story as a node graph.
// The .qalam text is the SINGLE SOURCE OF TRUTH. Every canvas edit is a
// surgical text edit that calls setSource(), never a regeneration.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  type NodeSelectionChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useStore } from "../store.js";
import { parseCanvas, autoLayout } from "../lib/canvas-parser.js";
import { getNodePositions, saveAllPositions } from "../lib/canvas-db.js";
import {
  appendDivert,
  appendNewPassage,
  deletePassage,
} from "../lib/canvas-edit.js";
import PassageNode from "./PassageNode.js";

// ---- Node type registration ------------------------------------------------

const nodeTypes = {
  passage: PassageNode,
};

// ---- Component -------------------------------------------------------------

function CanvasPaneInner() {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);
  const requestCursorJump = useStore((s) => s.requestCursorJump);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const prevSourceRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Track which nodes are selected (for delete confirmation)
  const selectedNodeIdsRef = useRef<Set<string>>(new Set());

  // Parse source into graph whenever source changes
  useEffect(() => {
    if (source === prevSourceRef.current && ready) return;
    prevSourceRef.current = source;

    const parsed = parseCanvas(source);

    // Apply saved positions or auto-layout
    getNodePositions()
      .then((savedPositions) => {
        let positionedNodes = parsed.nodes.map((n) => {
          const saved = savedPositions[n.id];
          if (saved) {
            return { ...n, position: saved };
          }
          return n;
        });

        // Auto-layout any unpositioned nodes
        const startId = positionedNodes[0]?.id;
        if (startId) {
          positionedNodes = autoLayout(positionedNodes, parsed.edges, startId);
        }

        setNodes(positionedNodes);
        setEdges(parsed.edges);
        setReady(true);
      })
      .catch(() => {
        // Fallback: use parsed nodes/edges without saved positions
        const startId = parsed.nodes[0]?.id;
        const positionedNodes = startId
          ? autoLayout(parsed.nodes, parsed.edges, startId)
          : parsed.nodes;
        setNodes(positionedNodes);
        setEdges(parsed.edges);
        setReady(true);
      });
  }, [source, ready]);

  // ---- Node interaction handlers ------------------------------------------

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Track selection changes
      for (const ch of changes) {
        if (ch.type === "select") {
          const sel = ch as NodeSelectionChange;
          if (sel.selected) {
            selectedNodeIdsRef.current.add(sel.id);
          } else {
            selectedNodeIdsRef.current.delete(sel.id);
          }
        }
      }
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // Click a node → jump to its passage in the text editor
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Don't jump for ghost nodes (missing passages)
      const data = node.data as { preview?: string } | undefined;
      if (data?.preview === "⚠️ مقطع غير موجود") return;
      requestCursorJump(node.id);
    },
    [requestCursorJump],
  );

  // Drag from handle → append a divert line in the source passage
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Don't connect a node to itself
      if (connection.source === connection.target) return;
      // Don't connect ghost nodes
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const sourceData = sourceNode?.data as { preview?: string } | undefined;
      if (sourceData?.preview === "⚠️ مقطع غير موجود") return;

      const newSource = appendDivert(source, connection.source, connection.target);
      if (newSource !== source) {
        setSource(newSource);
      }
    },
    [source, nodes, setSource],
  );

  // Save positions on node drag stop
  const handleNodeDragStop = useCallback(
    (_event: unknown, _node: Node) => {
      setTimeout(() => {
        setNodes((currentNodes) => {
          const pos: Record<string, { x: number; y: number }> = {};
          for (const n of currentNodes) {
            pos[n.id] = { x: n.position.x, y: n.position.y };
          }
          saveAllPositions(pos).catch(() => {});
          return currentNodes;
        });
      }, 100);
    },
    [],
  );

  // ---- Delete handler (keyboard) -----------------------------------------

  // Listen for Delete/Backspace on the canvas container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (selectedNodeIdsRef.current.size === 0) return;

      // Get the first selected passage node (not a ghost)
      const selectedIds = [...selectedNodeIdsRef.current];
      const nodeToDelete = nodes.find(
        (n) =>
          selectedIds.includes(n.id) &&
          (n.data as { preview?: string })?.preview !== "⚠️ مقطع غير موجود",
      );

      if (!nodeToDelete) return;

      const confirmed = window.confirm(
        `هل أنت متأكد من حذف مقطع "${nodeToDelete.id}"؟ لا يمكن التراجع عن هذا الإجراء من خلال المخطط.`,
      );

      if (!confirmed) return;

      const newSource = deletePassage(source, nodeToDelete.id);
      if (newSource !== source) {
        selectedNodeIdsRef.current.delete(nodeToDelete.id);
        setSource(newSource);
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [nodes, source, setSource]);

  // Double-click empty canvas → prompt for new passage name
  const handlePaneDoubleClick = useCallback(
    (_event: React.MouseEvent) => {
      const name = window.prompt("اسم المقطع الجديد:");
      if (!name || name.trim().length === 0) return;
      const newSource = appendNewPassage(source, name.trim());
      if (newSource !== source) {
        setSource(newSource);
      }
    },
    [source, setSource],
  );

  // Fit view button
  const { fitView } = useReactFlow();

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);

  // Keyboard: F for fit view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        fitView({ padding: 0.2 });
      }
    };
    container.addEventListener("keydown", handleKey);
    return () => container.removeEventListener("keydown", handleKey);
  }, [fitView]);

  // ---- Default edge options ----------------------------------------------

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: "var(--aq-border-hi)", strokeWidth: 1.5 },
      animated: false,
    }),
    [],
  );

  if (!ready) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--aq-dim)",
        }}
      >
        <p>جاري تحميل المخطّط...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ blockSize: "100%", minBlockSize: 0, direction: "ltr" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onDoubleClick={handlePaneDoubleClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={3}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        panOnDrag={[0, 1, 2]}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode="Control"
        selectionOnDrag={false}
        style={{ background: "var(--aq-input-bg)" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--aq-surface-hi)" />
        <Controls style={{ direction: "rtl" }} position="bottom-left" />
        <MiniMap
          style={{ background: "var(--aq-editor-bg)", border: "1px solid var(--aq-border)" }}
          nodeColor={(n) => {
            const d = n.data as { colour?: string } | undefined;
            if (!d?.colour) return "var(--aq-node-blue)";
            switch (d.colour) {
              case "green": return "var(--aq-node-green)";
              case "red": return "var(--aq-node-red)";
              case "orange": return "var(--aq-node-orange)";
              default: return "var(--aq-node-blue)";
            }
          }}
          maskColor="rgba(0,0,0,0.6)"
        />
        <Panel position="top-right">
          <button
            onClick={handleFitView}
            title="لائم الشاشة (F)"
            style={{
              padding: "0.375rem 0.625rem",
              fontSize: "0.75rem",
              fontFamily: "inherit",
              color: "var(--aq-text)",
              background: "var(--aq-surface-hi)",
              border: "1px solid var(--aq-border)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            لائم الشاشة
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// useReactFlow() only works INSIDE a ReactFlowProvider. Being the parent of
// <ReactFlow> is not enough — the hook reads a context that <ReactFlow> itself
// provides to its children, not to its parent. Without this wrapper the hook
// throws during render, React unmounts the tree, and the whole editor renders
// as a blank page. That is exactly what shipped on 30 Jul 2026.
export default function CanvasPane() {
  return (
    <ReactFlowProvider>
      <CanvasPaneInner />
    </ReactFlowProvider>
  );
}
