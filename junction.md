# 🔗 Junction Behavioral Specification (PIN)

Junctions in CircuitFlow (referenced by footprint ID `PIN`) are specialized nodes designed for path subdivision and curved routing control.

## 1. Visual Presentation
- **No Silkscreen**: 'PIN' junctions must not render a rectangular or circular outline. Only the copper pad is visible.
- **Library Pins vs junctions**: The lowercase `pin` footprint in the library is a standard component with an outline. The uppercase `PIN` is a non-outline junction.

## 2. Interaction & Movement
- **Center Snapping**: Component movement for ALL components snaps based on the **center of the first pin**, ensuring pad-to-grid alignment.
- **Placement Drag**: All components (including 'PIN' junctions) remain 'sticky' and follow the cursor immediately upon placement or creation until the pointer is released.
- **Move Primary**: Dragging on a 'PIN' junction pad initiates a **Move** operation instead of routing a new trace.

## 3. Path Topology & Continuity
- **Merge on Delete**: Deleting a 'PIN' junction connected to exactly two traces merges the segments into a single continuous trace.
- **Smooth Joining (C1 Continuity)**: 'PIN' junctions enforce tangent continuity. Adjusting the control handle of one trace segment automatically mirrors the adjustment on the adjacent segment's handle.

## 4. Connectivity Rules
- **Non-Component Connection**: Traces connected to a 'PIN' junction are logically parts of the same net path.
- **Auto-Adjustment**: Moving a 'PIN' junction updates all connected segments instantly.



When moving junction always be the same Smooth joining 
also when moving components