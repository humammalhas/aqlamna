// ---------------------------------------------------------------------------
// CanvasPane — React Flow canvas displaying the .qalam story as a node graph.
// Read-only view: the .qalam text is the source of truth.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useStore } from "../store.js";
import { parseCanvas, autoLayout } from "../lib/canvas-parser.js";
import { getNodePositions, saveAllPositions } from "../lib/canvas-db.js";
import PassageNode from "./PassageNode.js";

// ---- Node type registration ------------------------------------------------

const nodeTypes = {
  passage: PassageNode,
};

// ---- Component -------------------------------------------------------------

export default function CanvasPane() {
  const source = useStore((s) => s.source);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const prevSourceRef = useRef<string>("");

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

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // Save positions on node drag stop
  const handleNodeDragStop = useCallback(
    (_event: unknown, _node: Node) => {
      // Snapshot current positions
      const positions: Record<string, { x: number; y: number }> = {};
      // We need to read the latest nodes — use the ref pattern or get from DOM
      // For simplicity, use a small timeout to ensure positions are settled
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

  // Default edge options
  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: "#4a4030", strokeWidth: 1.5 },
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
          color: "#5a5040",
        }}
      >
        <p>جاري تحميل المخطّط...</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, direction: "ltr" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={3}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        panOnDrag={[1, 2]}
        selectionOnDrag={false}
        style={{ background: "#0e0d0b" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2a2620" />
        <Controls style={{ direction: "rtl" }} position="bottom-left" />
        <MiniMap
          style={{ background: "#141210" }}
          nodeColor={(n) => {
            const d = n.data as { colour?: string } | undefined;
            if (!d?.colour) return "#48a";
            switch (d.colour) {
              case "green":
                return "#4a8";
              case "red":
                return "#c44";
              case "orange":
                return "#d8a";
              default:
                return "#48a";
            }
          }}
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>
    </div>
  );
}
