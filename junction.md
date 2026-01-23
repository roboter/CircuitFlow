# 🔗 Junction Behavioral Specification (JUNCTION)

Junctions in CircuitFlow are specialized logical entities designed for path subdivision and curved routing control. They are **not** pins and should be treated as distinct routing nodes.

## 1. Visual Presentation
- **Identity**: Referenced by the unique footprint ID `JUNCTION`.
- **No Silkscreen**: Junctions must not render a rectangular or circular component outline. Only the copper pad (via) is visible.
- **Conceptual Separation**: Standard "Pins" (footprint ID `pin`) are component-attached terminals. "Junctions" are standalone trace nodes used for splitting and redirection.

## 2. Interaction & Movement
- **Placement Drag**: Junctions remain 'sticky' and follow the cursor immediately upon creation via trace-splitting until released.
- **Move Primary**: Interaction on a Junction pad initiates a **Move** operation by default, reshaping the connected traces.

## 3. Path Topology & Continuity
- **Merge on Delete**: Deleting a Junction connected to exactly two traces merges the segments into a single continuous trace.
- **C1 Continuity**: Junctions enforce tangent continuity. Adjusting a control handle on one segment mirrors the adjustment on the adjacent segment's handle.

## 4. Trace Splitting (The Junction Creation Flow)
- **Trace Interaction**: Clicking and dragging on a trace segment (not on a pin) dynamically inserts a `JUNCTION` entity at the drag point.
- **Real-time Reshaping**: The new Junction bifurcates the trace and enters a 'Move' state, following the cursor instantly.
