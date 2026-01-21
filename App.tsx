import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { 
  PCBComponent, Trace, Vector2 
} from './types';
import { FOOTPRINTS, SNAP_SIZE } from './constants';
import { getPinGlobalPos, generateBezierPath, getPointOnBezier, checkCollision, getBezierControlPoints } from './utils/pcbUtils';
import { exportToGRBL } from './utils/grblExporter';
import { 
  Trash2, 
  Download, 
  RotateCw, 
  CircuitBoard,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Plus,
  Hand,
  MousePointerSquareDashed,
  Activity,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  Info,
  Layers,
  Move,
  X,
  Type as TypeIcon,
  Zap,
  GitBranch,
  Circle,
  RefreshCw
} from 'lucide-react';

const App: React.FC = () => {
  // --- Design State ---
  const [components, setComponents] = useState<PCBComponent[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [invalidTraceIds, setInvalidTraceIds] = useState<Set<string>>(new Set());
  const [violationMarkers, setViolationMarkers] = useState<Vector2[]>([]);
  const [isDrcRunning, setIsDrcRunning] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<'none' | 'pass' | 'fail'>('none');
  
  // --- Interaction State ---
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [pendingFootprintId, setPendingFootprintId] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState<Vector2 | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.5 });
  
  const dragRef = useRef<{
    type: 'move' | 'route' | 'pan' | 'marquee' | 'handle' | 'potential_split';
    id?: string;
    handleIdx?: 1 | 2;
    startWorld: Vector2;
    offset?: Vector2;
    hasMoved?: boolean;
    // Cache for immediately created components to fix staleness in drag
    initialComp?: Partial<PCBComponent> & { footprintId: string; rotation: number };
  } | null>(null);

  const [routingPreview, setRoutingPreview] = useState<{from: Vector2, to: Vector2, path: string} | null>(null);
  const [marquee, setMarquee] = useState<{start: Vector2, end: Vector2} | null>(null);

  const boardRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);

  // --- Helpers ---
  const snap = (v: number) => Math.round(v / SNAP_SIZE) * SNAP_SIZE;

  const getScreenToWorld = useCallback((clientX: number, clientY: number): Vector2 => {
    const svg = boardRef.current;
    const g = viewportRef.current;
    if (!svg || !g) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const worldPt = pt.matrixTransform(g.getScreenCTM()?.inverse());
    return { x: worldPt.x, y: worldPt.y };
  }, []);

  const handleZoom = useCallback((delta: number, centerX?: number, centerY?: number) => {
    setViewport(prev => {
      const scaleFactor = 1.15;
      const zoomIn = delta > 0;
      const newScale = zoomIn ? prev.scale * scaleFactor : prev.scale / scaleFactor;
      const clampedScale = Math.min(Math.max(newScale, 0.05), 10);
      
      if (clampedScale === prev.scale) return prev;

      let cx = centerX;
      let cy = centerY;

      if (cx === undefined || cy === undefined) {
        const svg = boardRef.current;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          cx = rect.left + rect.width / 2;
          cy = rect.top + rect.height / 2;
        } else {
          cx = window.innerWidth / 2;
          cy = window.innerHeight / 2;
        }
      }

      const svg = boardRef.current;
      const rect = svg?.getBoundingClientRect() || { left: 0, top: 0 };
      const localX = cx - rect.left;
      const localY = cy - rect.top;

      const worldX = (localX - prev.x) / prev.scale;
      const worldY = (localY - prev.y) / prev.scale;

      return {
        x: localX - worldX * clampedScale,
        y: localY - worldY * clampedScale,
        scale: clampedScale
      };
    });
  }, []);

  const allPins = useMemo(() => {
    return components.flatMap(comp => {
      const footprint = FOOTPRINTS.find(f => f.id === comp.footprintId);
      return footprint?.pins.map(p => ({
        ...p,
        id: `${comp.id}_${p.id}`,
        componentId: comp.id,
        globalPos: getPinGlobalPos(comp, p)
      })) || [];
    });
  }, [components]);

  const hoveredPin = useMemo(() => {
    return allPins.find(p => p.id === hoveredPinId);
  }, [allPins, hoveredPinId]);

  // Derive selection info
  const selectedItems = useMemo(() => {
    const comps = components.filter(c => selectedIds.has(c.id));
    const trcs = traces.filter(t => selectedIds.has(t.id));
    return { components: comps, traces: trcs };
  }, [components, traces, selectedIds]);

  // --- DRC Logic ---
  const runDRC = useCallback(() => {
    setIsDrcRunning(true);
    const invalid = new Set<string>();
    const markers: Vector2[] = [];
    const clearance = SNAP_SIZE * 0.45;

    const traceData = traces.map(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId);
      const p2 = allPins.find(p => p.id === t.toPinId);
      if (!p1 || !p2) return null;
      return {
        id: t.id, from: t.fromPinId, to: t.toPinId,
        pts: Array.from({ length: 15 }, (_, i) => getPointOnBezier(i / 14, p1.globalPos, p2.globalPos, t))
      };
    }).filter(d => d !== null);

    for (let i = 0; i < traceData.length; i++) {
      for (let j = i + 1; j < traceData.length; j++) {
        const a = traceData[i]!;
        const b = traceData[j]!;
        const connected = a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
        if (connected) continue;

        let pairCollisionFound = false;
        for (const pa of a.pts) {
          for (const pb of b.pts) {
            if (checkCollision(pa, pb, clearance)) {
              invalid.add(a.id); 
              invalid.add(b.id);
              if (!pairCollisionFound && markers.length < 30) {
                markers.push({ x: (pa.x + pb.x)/2, y: (pa.y + pb.y)/2 });
                pairCollisionFound = true; 
              }
              break;
            }
          }
          if (pairCollisionFound) break;
        }
      }
    }

    components.forEach(c => {
      const foot = FOOTPRINTS.find(f => f.id === c.footprintId);
      if(!foot) return;
      traceData.forEach(t => {
        let padCollisionFound = false;
        foot.pins.forEach(pin => {
          const pinId = `${c.id}_${pin.id}`;
          if (t.from === pinId || t.to === pinId) return;
          const pinPos = getPinGlobalPos(c, pin);
          for (const pt of t.pts) {
            if(checkCollision(pt, pinPos, clearance)) {
              invalid.add(t.id);
              if (!padCollisionFound && markers.length < 30) {
                markers.push(pt);
                padCollisionFound = true; 
              }
              break;
            }
          }
        });
      });
    });

    setInvalidTraceIds(invalid);
    setViolationMarkers(markers);
    setLastCheckResult(invalid.size > 0 ? 'fail' : (traces.length > 0 ? 'pass' : 'none'));
    setTimeout(() => setIsDrcRunning(false), 200);
  }, [traces, allPins, components]);

  useEffect(() => {
    const timeout = setTimeout(runDRC, 800);
    return () => clearTimeout(timeout);
  }, [traces, components, runDRC]);

  // Create a junction at a specific world coordinate
  const createJunctionAt = (world: Vector2): string => {
    const junctionPos = { x: snap(world.x) - 12.7, y: snap(world.y) - 12.7 };
    const junctionId = `comp_junc_${Date.now()}`;
    const newJunction: PCBComponent = {
      id: junctionId,
      footprintId: 'PIN',
      name: 'J' + (components.length + 1),
      position: junctionPos,
      rotation: 0
    };
    
    setComponents(prev => [...prev, newJunction]);
    return `${junctionId}_p1`;
  };

  // Helper to calculate comp pos from a snapped pin target
  const getCompPosForPinTarget = (footprintId: string, targetPinWorld: Vector2, rotation: number) => {
    const foot = FOOTPRINTS.find(f => f.id === footprintId);
    if (!foot) return targetPinWorld;
    const firstPin = foot.pins[0];
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = foot.width / 2;
    const cy = foot.height / 2;
    const lx = firstPin.localPos.x - cx;
    const ly = firstPin.localPos.y - cy;
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    return {
      x: targetPinWorld.x - (rx + cx),
      y: targetPinWorld.y - (ry + cy)
    };
  };

  // --- Interaction Handlers ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    const world = getScreenToWorld(e.clientX, e.clientY);

    if (pendingFootprintId) {
      const foot = FOOTPRINTS.find(f => f.id === pendingFootprintId);
      if (foot) {
        const pos = getCompPosForPinTarget(pendingFootprintId, { x: snap(world.x), y: snap(world.y) }, 0);
        const id = `comp_${Date.now()}`;
        const newComp = {
          id, footprintId: pendingFootprintId, name: foot.name.split(' ')[0].substring(0,3).toUpperCase() + (components.length+1),
          position: pos, rotation: 0, value: foot.valueType === 'resistance' ? '10k' : (foot.valueType === 'capacitance' ? '100nF' : undefined)
        };
        setComponents(prev => [...prev, newComp]);
        setSelectedIds(new Set([id]));
        
        // ALL components should be moved when placed until release
        dragRef.current = { 
          type: 'move', id, startWorld: world, offset: { x: 0, y: 0 }, hasMoved: true,
          initialComp: newComp
        };
        
        setPendingFootprintId(null);
        setPreviewPos(null);
      }
      return;
    }

    if (tool === 'pan' || e.button === 1) {
      dragRef.current = { type: 'pan', startWorld: { x: e.clientX, y: e.clientY } };
      return;
    }

    // Check handles
    for (const tId of selectedIds) {
      const trace = traces.find(t => t.id === tId);
      if (trace) {
        const p1 = allPins.find(p => p.id === trace.fromPinId);
        const p2 = allPins.find(p => p.id === trace.toPinId);
        if (p1 && p2) {
          const ctrl = getBezierControlPoints(p1.globalPos, p2.globalPos, trace);
          if (checkCollision(world, { x: ctrl.cx1, y: ctrl.cy1 }, 12)) {
            dragRef.current = { type: 'handle', id: tId, handleIdx: 1, startWorld: world, offset: { x: world.x - ctrl.cx1, y: world.y - ctrl.cy1 } };
            return;
          }
          if (checkCollision(world, { x: ctrl.cx2, y: ctrl.cy2 }, 12)) {
            dragRef.current = { type: 'handle', id: tId, handleIdx: 2, startWorld: world, offset: { x: world.x - ctrl.cx2, y: world.y - ctrl.cy2 } };
            return;
          }
        }
      }
    }

    const hitPin = allPins.find(p => checkCollision(p.globalPos, world, 12));
    if (hitPin && tool === 'select') {
      const comp = components.find(c => c.id === hitPin.componentId);
      // Junction logic: clicking/dragging a 'PIN' junction moves it
      if (comp?.footprintId === 'PIN') {
        setSelectedIds(new Set([comp.id]));
        dragRef.current = { 
          type: 'move', id: comp.id, startWorld: world, 
          offset: { x: world.x - hitPin.globalPos.x, y: world.y - hitPin.globalPos.y },
          hasMoved: false
        };
        return;
      }
      dragRef.current = { type: 'route', id: hitPin.id, startWorld: world };
      return;
    }

    const hitTrace = [...traces].reverse().find(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId);
      const p2 = allPins.find(p => p.id === t.toPinId);
      if(!p1 || !p2) return false;
      for(let i=0; i<=20; i++) {
        const pt = getPointOnBezier(i/20, p1.globalPos, p2.globalPos, t);
        if(checkCollision(world, pt, 15)) return true;
      }
      return false;
    });

    if (hitTrace) {
      if (e.shiftKey) {
        const next = new Set(selectedIds);
        if (next.has(hitTrace.id)) next.delete(hitTrace.id); else next.add(hitTrace.id);
        setSelectedIds(next);
      } else {
        setSelectedIds(new Set([hitTrace.id]));
        dragRef.current = { type: 'potential_split', id: hitTrace.id, startWorld: world, hasMoved: false };
      }
      return;
    }

    const hitComp = [...components].reverse().find(c => {
      const foot = FOOTPRINTS.find(f => f.id === c.footprintId);
      return foot && world.x >= c.position.x && world.x <= c.position.x + foot.width &&
                   world.y >= c.position.y && world.y <= c.position.y + foot.height;
    });

    if (hitComp) {
      const isSelected = selectedIds.has(hitComp.id);
      if (!e.shiftKey && !isSelected) {
        setSelectedIds(new Set([hitComp.id]));
      } else if (e.shiftKey) {
        const next = new Set(selectedIds);
        if (isSelected) next.delete(hitComp.id); else next.add(hitComp.id);
        setSelectedIds(next);
      }
      const p1 = allPins.find(p => p.componentId === hitComp.id);
      dragRef.current = { 
        type: 'move', id: hitComp.id, startWorld: world, 
        offset: p1 ? { x: world.x - p1.globalPos.x, y: world.y - p1.globalPos.y } : { x: 0, y: 0 },
        hasMoved: false
      };
      return;
    }

    if (!e.shiftKey) setSelectedIds(new Set());
    dragRef.current = { type: 'marquee', startWorld: world };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = getScreenToWorld(e.clientX, e.clientY);
    if (pendingFootprintId) { setPreviewPos(world); return; }
    
    const drag = dragRef.current;
    const hitPin = allPins.find(p => checkCollision(p.globalPos, world, 15));
    if (drag?.type === 'route' && hitPin?.id === drag.id) {
      setHoveredPinId(null);
    } else {
      setHoveredPinId(hitPin?.id || null);
    }

    if (!drag) return;

    if (drag.type === 'pan') {
      const dx = e.clientX - drag.startWorld.x;
      const dy = e.clientY - drag.startWorld.y;
      setViewport(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      drag.startWorld = { x: e.clientX, y: e.clientY };
    } else if (drag.type === 'potential_split' && drag.id) {
      const dist = Math.hypot(world.x - drag.startWorld.x, world.y - drag.startWorld.y);
      if (dist > 8) {
        const hitTrace = traces.find(t => t.id === drag.id);
        if (hitTrace) {
          const junctionPinId = createJunctionAt(world);
          const newCompId = junctionPinId.split('_')[0];
          const seg1: Trace = { id: `trace_${Date.now()}_1`, fromPinId: hitTrace.fromPinId, toPinId: junctionPinId, width: hitTrace.width, color: hitTrace.color };
          const seg2: Trace = { id: `trace_${Date.now()}_2`, fromPinId: junctionPinId, toPinId: hitTrace.toPinId, width: hitTrace.width, color: hitTrace.color };
          setTraces(prev => [...prev.filter(t => t.id !== hitTrace.id), seg1, seg2]);
          setSelectedIds(new Set([newCompId]));
          
          const newJunction = { id: newCompId, footprintId: 'PIN', rotation: 0 };
          dragRef.current = { 
            type: 'move', id: newCompId, startWorld: world, offset: { x: 0, y: 0 }, hasMoved: true,
            initialComp: newJunction as any
          };
        }
      }
    } else if (drag.type === 'move' && drag.id) {
      // Priority 1: Check components list. Priority 2: Use initialComp cache for just-added components.
      const comp = components.find(c => c.id === drag.id) || drag.initialComp;
      if (comp) {
        const snappedPinWorld = { x: snap(world.x - (drag.offset?.x || 0)), y: snap(world.y - (drag.offset?.y || 0)) };
        const newPos = getCompPosForPinTarget(comp.footprintId, snappedPinWorld, comp.rotation);
        if (Math.abs(newPos.x - (comp.position?.x || 0)) > 1 || Math.abs(newPos.y - (comp.position?.y || 0)) > 1) drag.hasMoved = true;
        setComponents(prev => prev.map(c => c.id === drag.id ? { ...c, position: newPos } : c));
      }
    } else if (drag.type === 'route' && drag.id) {
      const startPin = allPins.find(p => p.id === drag.id);
      if (startPin) {
        const targetPinPos = hitPin && hitPin.id !== drag.id ? hitPin.globalPos : world;
        setRoutingPreview({ from: startPin.globalPos, to: targetPinPos, path: generateBezierPath(startPin.globalPos, targetPinPos) });
      }
    } else if (drag.type === 'handle' && drag.id && drag.handleIdx) {
      const targetPos = { x: world.x - (drag.offset?.x || 0), y: world.y - (drag.offset?.y || 0) };
      setTraces(prev => {
        const newTraces = prev.map(t => {
          if (t.id !== drag.id) return t;
          const p1 = allPins.find(p => p.id === t.fromPinId);
          const p2 = allPins.find(p => p.id === t.toPinId);
          if (!p1 || !p2) return t;
          return drag.handleIdx === 1 
            ? { ...t, c1Offset: { x: targetPos.x - p1.globalPos.x, y: targetPos.y - p1.globalPos.y } }
            : { ...t, c2Offset: { x: targetPos.x - p2.globalPos.x, y: targetPos.y - p2.globalPos.y } };
        });

        // Smooth Joining Logic: Adjust adjacent traces at 'PIN' junctions
        const movedTrace = newTraces.find(t => t.id === drag.id);
        if (movedTrace) {
          const pinId = drag.handleIdx === 1 ? movedTrace.fromPinId : movedTrace.toPinId;
          const pin = allPins.find(p => p.id === pinId);
          const comp = components.find(c => c.id === pin?.componentId);
          if (comp?.footprintId === 'PIN') {
            const adjacent = newTraces.find(t => t.id !== movedTrace.id && (t.fromPinId === pinId || t.toPinId === pinId));
            if (adjacent) {
              const movingOffset = drag.handleIdx === 1 ? movedTrace.c1Offset! : movedTrace.c2Offset!;
              const oppositeOffset = { x: -movingOffset.x, y: -movingOffset.y };
              if (adjacent.fromPinId === pinId) adjacent.c1Offset = oppositeOffset;
              else adjacent.c2Offset = oppositeOffset;
            }
          }
        }
        return [...newTraces];
      });
    } else if (drag.type === 'marquee') {
      setMarquee({ start: drag.startWorld, end: world });
      const minX = Math.min(drag.startWorld.x, world.x), maxX = Math.max(drag.startWorld.x, world.x);
      const minY = Math.min(drag.startWorld.y, world.y), maxY = Math.max(drag.startWorld.y, world.y);
      const inBox = components.filter(c => {
        const f = FOOTPRINTS.find(foot => foot.id === c.footprintId);
        return f && c.position.x >= minX && c.position.x + f.width <= maxX && c.position.y >= minY && c.position.y + f.height <= maxY;
      }).map(c => c.id);
      setSelectedIds(new Set(inBox));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.type === 'route' && routingPreview) {
      const world = getScreenToWorld(e.clientX, e.clientY);
      const endPin = allPins.find(p => checkCollision(p.globalPos, world, 15) && p.id !== drag.id);
      if (endPin && drag.id) {
        setTraces(prev => [...prev, { id: `trace_${Date.now()}`, fromPinId: drag.id!, toPinId: endPin.id, width: 8, color: '#10b981' }]);
      } else {
        const hitTrace = [...traces].reverse().find(t => {
          const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
          if(!p1 || !p2) return false;
          for(let i=0; i<=20; i++) {
            const pt = getPointOnBezier(i/20, p1.globalPos, p2.globalPos, t);
            if(checkCollision(world, pt, 25)) return true;
          }
          return false;
        });
        if (hitTrace) {
          const junctionPinId = createJunctionAt(world);
          setTraces(prev => [...prev, { id: `trace_${Date.now()}`, fromPinId: drag.id!, toPinId: junctionPinId, width: 8, color: '#10b981' }]);
        }
      }
    }
    dragRef.current = null;
    setRoutingPreview(null);
    setMarquee(null);
    setHoveredPinId(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    handleZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  };

  const rotateSelected = () => {
    setComponents(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, rotation: (c.rotation + 90) % 360 } : c));
  };

  const deleteSelected = () => {
    const selectedComps = components.filter(c => selectedIds.has(c.id));
    const junctionToMerge = selectedComps.find(c => c.footprintId === 'PIN');
    
    // Auto-merge logic for junction deletion
    if (junctionToMerge && selectedIds.size === 1) {
      const connectedTraces = traces.filter(t => 
        t.fromPinId.startsWith(junctionToMerge.id) || 
        t.toPinId.startsWith(junctionToMerge.id)
      );

      if (connectedTraces.length === 2) {
        const [t1, t2] = connectedTraces;
        const startPinId = t1.fromPinId.startsWith(junctionToMerge.id) ? t1.toPinId : t1.fromPinId;
        const endPinId = t2.fromPinId.startsWith(junctionToMerge.id) ? t2.toPinId : t2.fromPinId;
        const merged: Trace = {
          id: `trace_merged_${Date.now()}`,
          fromPinId: startPinId,
          toPinId: endPinId,
          width: Math.max(t1.width, t2.width),
          color: t1.color
        };
        setTraces(prev => [...prev.filter(t => t.id !== t1.id && t.id !== t2.id), merged]);
        setComponents(prev => prev.filter(c => c.id !== junctionToMerge.id));
        setSelectedIds(new Set([merged.id]));
        return;
      }
    }

    setComponents(prev => prev.filter(c => !selectedIds.has(c.id)));
    setTraces(prev => prev.filter(t => !selectedIds.has(t.id) && 
      !selectedIds.has(allPins.find(p => p.id === t.fromPinId)?.componentId || '') &&
      !selectedIds.has(allPins.find(p => p.id === t.toPinId)?.componentId || '')
    ));
    setSelectedIds(new Set());
  };

  const updateTraceWidth = (id: string, width: number) => {
    setTraces(prev => prev.map(t => t.id === id ? { ...t, width } : t));
  };

  const updateComponentProps = (id: string, updates: Partial<PCBComponent>) => {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans select-none">
      <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col p-4 gap-6 z-10 shadow-2xl overflow-y-auto scrollbar-thin">
        <div className="flex items-center gap-3 px-2">
          <div className="bg-emerald-500/10 p-2 rounded-lg"><CircuitBoard className="text-emerald-500" size={24} /></div>
          <h1 className="font-bold text-xl tracking-tight bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">CircuitFlow</h1>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-2 flex items-center gap-2">
            <Layers size={14} /> Library
          </label>
          <div className="grid grid-cols-1 gap-2">
            {FOOTPRINTS.filter(f => f.id !== 'PIN').map(f => (
              <button key={f.id} onClick={() => setPendingFootprintId(f.id)} className={`flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-medium ${pendingFootprintId === f.id ? 'bg-emerald-500 text-white shadow-lg' : 'bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50'}`}>
                <div className="p-1.5 bg-zinc-900/50 rounded-md">{f.id === 'pin' ? <Circle size={16} /> : <Plus size={16} />}</div>
                {f.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-4 border-t border-zinc-800 pt-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">DRC Status</span>
              <button onClick={() => runDRC()} className="hover:bg-zinc-800 p-1.5 rounded-lg text-zinc-500 hover:text-emerald-500 transition-colors">
                <RefreshCw size={14} className={isDrcRunning ? "animate-spin" : ""} />
              </button>
            </div>
            <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${lastCheckResult === 'fail' ? 'bg-red-500/10 border-red-500/50 text-red-400' : lastCheckResult === 'pass' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500'}`}>
              <div className="shrink-0">{lastCheckResult === 'fail' ? <AlertTriangle size={24} /> : lastCheckResult === 'pass' ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}</div>
              <span className="text-sm font-bold tracking-tight">{isDrcRunning ? 'Analyzing...' : lastCheckResult === 'fail' ? `${invalidTraceIds.size} Conflicts` : lastCheckResult === 'pass' ? 'Rules Pass' : 'Board Empty'}</span>
            </div>
          </div>
          <button onClick={() => console.log(exportToGRBL(components, traces, allPins))} className="flex items-center justify-center gap-2 w-full p-4 bg-zinc-100 hover:bg-white text-zinc-950 rounded-2xl font-bold transition-all hover:scale-[1.02] shadow-xl">
            <Download size={20} /> Export GRBL
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-2xl shadow-2xl z-20">
          <button onClick={() => setTool('select')} className={`p-3 rounded-xl transition-all ${tool === 'select' ? 'bg-emerald-500 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}><MousePointer2 size={20} /></button>
          <button onClick={() => setTool('pan')} className={`p-3 rounded-xl transition-all ${tool === 'pan' ? 'bg-emerald-500 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}><Hand size={20} /></button>
          <div className="w-px h-6 bg-zinc-800 mx-1" />
          <button onClick={rotateSelected} className="p-3 rounded-xl hover:bg-zinc-800 text-zinc-400 disabled:opacity-30" disabled={selectedIds.size === 0}><RotateCw size={20} /></button>
          <button onClick={deleteSelected} className="p-3 rounded-xl hover:bg-red-500/20 hover:text-red-400 text-zinc-400 disabled:opacity-30" disabled={selectedIds.size === 0}><Trash2 size={20} /></button>
          <div className="w-px h-6 bg-zinc-800 mx-1" />
          <div className="flex items-center gap-1 bg-zinc-950/50 rounded-xl px-2">
            <button className="p-2 hover:bg-zinc-800 text-zinc-400" onClick={() => handleZoom(1)}><ZoomIn size={16} /></button>
            <span className="text-[10px] font-mono text-zinc-600 w-12 text-center">{Math.round(viewport.scale * 100)}%</span>
            <button className="p-2 hover:bg-zinc-800 text-zinc-400" onClick={() => handleZoom(-1)}><ZoomOut size={16} /></button>
          </div>
        </div>

        <svg ref={boardRef} className="w-full h-full cursor-crosshair touch-none outline-none bg-zinc-950" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
          <g ref={viewportRef} transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
            <defs>
              <pattern id="grid" width={SNAP_SIZE} height={SNAP_SIZE}   patternTransform="translate(-3 -3)" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="3" r="3" fill="#1d2a2f" />
                </pattern>
            </defs>
            <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />

            {components.map(c => {
              const foot = FOOTPRINTS.find(f => f.id === c.footprintId);
              if (!foot) return null;
              const isSelected = selectedIds.has(c.id);
              const isJunction = foot.id === 'PIN';
              
              return (
                <g key={c.id} transform={`translate(${c.position.x}, ${c.position.y}) rotate(${c.rotation}, ${foot.width/2}, ${foot.height/2})`} className="transition-transform duration-75">
                  {!isJunction && (
                    <rect width={foot.width} height={foot.height} fill={isSelected ? '#10b98115' : 'transparent'} stroke={isSelected ? '#10b981' : '#27272a'} strokeWidth="1.5" rx="4" />
                  )}
                  
                  {foot.id === 'pin' && (
                    <circle cx={foot.width/2} cy={foot.height/2} r={foot.width/2 - 2} fill="transparent" stroke={isSelected ? '#10b98140' : '#27272a40'} strokeWidth="1" strokeDasharray="2 2" />
                  )}

                  {!isJunction && <text x={foot.width / 2} y={-10} textAnchor="middle" fill="#3f3f46" className="text-[9px] font-mono font-bold pointer-events-none" dy=".3em">{c.name}</text>}
                  {c.value && <text x={foot.width / 2} y={foot.height + 15} textAnchor="middle" fill="#10b981" className="text-[8px] font-mono font-bold pointer-events-none">{c.value}</text>}
                  
                  {foot.pins.map(pin => {
                    const isHovered = hoveredPinId === `${c.id}_${pin.id}`;
                    return (
                      <g key={pin.id}>
                        {isHovered && dragRef.current?.type === 'route' && <circle cx={pin.localPos.x} cy={pin.localPos.y} r="12" fill="#10b98120" className="animate-pulse" />}
                        <circle cx={pin.localPos.x} cy={pin.localPos.y} r={isHovered ? 5.5 : 4} fill={isHovered ? '#10b981' : '#18181b'} stroke={pin.type === 'power' ? '#ef4444' : (pin.type === 'ground' ? '#3b82f6' : '#3f3f46')} strokeWidth="1" className="transition-all duration-150" />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {traces.map(t => {
              const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
              if (!p1 || !p2) return null;
              const isSelected = selectedIds.has(t.id), isInvalid = invalidTraceIds.has(t.id);
              const path = generateBezierPath(p1.globalPos, p2.globalPos, t);
              return (
                <g key={t.id}>
                  <path d={path} stroke="transparent" strokeWidth={t.width + 15} fill="none" strokeLinecap="round" className="cursor-pointer" />
                  <path d={path} stroke={isInvalid ? '#ef4444' : (isSelected ? '#34d399' : '#10b981')} strokeWidth={t.width} fill="none" strokeLinecap="round" className="transition-colors pointer-events-none" />
                  {isSelected && (
                    <g className="pointer-events-none">
                      {(() => {
                        const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(p1.globalPos, p2.globalPos, t);
                        return (
                          <>
                            <line x1={p1.globalPos.x} y1={p1.globalPos.y} x2={cx1} y2={cy1} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" />
                            <line x1={p2.globalPos.x} y1={p2.globalPos.y} x2={cx2} y2={cy2} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" />
                            <circle cx={cx1} cy={cy1} r="3" fill="#10b981" className="pointer-events-auto cursor-move shadow-sm" />
                            <circle cx={cx2} cy={cy2} r="3" fill="#10b981" className="pointer-events-auto cursor-move shadow-sm" />
                          </>
                        );
                      })()}
                    </g>
                  )}
                </g>
              );
            })}

            {routingPreview && <path d={routingPreview.path} stroke="#10b981" strokeWidth="4" fill="none" strokeDasharray="4 4" className="pointer-events-none opacity-50" />}
            {violationMarkers.map((m, i) => (
              <g key={i} transform={`translate(${m.x}, ${m.y})`}><circle r="18" fill="#ef444430" className="animate-pulse" /><path d="M 0 -12 L 12 9 L -12 9 Z" fill="#ef4444" stroke="#09090b" strokeWidth="1.5" strokeLinejoin="round" /><text x="0" y="6" textAnchor="middle" fill="#fff" className="text-[10px] font-bold font-sans pointer-events-none">!</text></g>
            ))}

            {hoveredPin && !marquee && !pendingFootprintId && (
              <g transform={`translate(${hoveredPin.globalPos.x + 15}, ${hoveredPin.globalPos.y - 15})`} className="pointer-events-none drop-shadow-2xl z-50">
                <rect x="0" y="0" width={Math.max(80, hoveredPin.name.length * 9 + 40)} height="40" rx="6" fill="#09090b" stroke="#27272a" strokeWidth="1" />
                <text x="10" y="16" fill="#10b981" className="text-[11px] font-mono font-bold tracking-tight">{hoveredPin.name}</text>
                <text x="10" y="30" fill="#71717a" className="text-[9px] font-mono uppercase tracking-wider font-bold">{hoveredPin.type}</text>
              </g>
            )}

            {pendingFootprintId && previewPos && (
              (() => {
                const foot = FOOTPRINTS.find(f => f.id === pendingFootprintId);
                if (!foot) return null;
                const tx = snap(previewPos.x);
                const ty = snap(previewPos.y);
                const compPos = getCompPosForPinTarget(pendingFootprintId, {x: tx, y: ty}, 0);
                return (
                  <g transform={`translate(${compPos.x}, ${compPos.y})`}>
                    <rect width={foot.width} height={foot.height} fill="#10b98110" stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" className="pointer-events-none" />
                  </g>
                );
              })()
            )}
            {marquee && <rect x={Math.min(marquee.start.x, marquee.end.x)} y={Math.min(marquee.start.y, marquee.end.y)} width={Math.abs(marquee.end.x - marquee.start.x)} height={Math.abs(marquee.end.y - marquee.start.y)} fill="#10b98105" stroke="#10b981" strokeWidth="0.5" className="pointer-events-none" />}
          </g>
        </svg>

        <div className="absolute top-24 left-6 flex flex-col gap-2 pointer-events-none">
          {selectedIds.size > 0 && (
            <div className="bg-zinc-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-zinc-800 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
              <MousePointerSquareDashed size={14} className="text-emerald-500" />
              <span className="text-xs font-semibold">{selectedIds.size} Items Selected</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col p-4 gap-6 z-10 shadow-2xl overflow-y-auto scrollbar-thin">
        <div className="flex items-center gap-3 px-2">
          <Settings2 size={18} className="text-zinc-500" />
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Inspector</h2>
        </div>
        {selectedItems.traces.length === 1 && selectedItems.components.length === 0 ? (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-2">
            <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
              <div className="flex items-center gap-2 mb-4"><Activity size={16} className="text-emerald-500" /><h3 className="text-sm font-bold">Trace Editor</h3></div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center"><label className="text-[10px] text-zinc-500 font-bold uppercase">Trace Width</label><span className="text-[10px] font-mono text-emerald-500">{selectedItems.traces[0].width} px</span></div>
                  <input type="range" min="1" max="50" step="1" value={selectedItems.traces[0].width} onChange={(e) => updateTraceWidth(selectedItems.traces[0].id, parseInt(e.target.value))} className="w-full accent-emerald-500 bg-zinc-900 h-1.5 rounded-lg appearance-none cursor-pointer" />
                </div>
              </div>
            </div>
          </div>
        ) : selectedItems.components.length === 1 && selectedItems.traces.length === 0 ? (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-2">
            <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
              <div className="flex items-center gap-2 mb-4"><Layers size={16} className="text-emerald-500" /><h3 className="text-sm font-bold">Properties</h3></div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Designator</label>
                  <input type="text" value={selectedItems.components[0].name} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { name: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono" />
                </div>
                {(() => {
                  const foot = FOOTPRINTS.find(f => f.id === selectedItems.components[0].footprintId);
                  if (!foot || !foot.valueType) return null;
                  return (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{foot.valueType === 'resistance' ? 'Resistance' : 'Capacitance'}</label>
                      <div className="relative"><input type="text" value={selectedItems.components[0].value || ''} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { value: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono pl-10" /><Zap size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500/50" /></div>
                    </div>
                  );
                })()}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Position</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={Math.round(selectedItems.components[0].position.x)} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { position: { ...selectedItems.components[0].position, x: parseFloat(e.target.value) || 0 } })} className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono" />
                    <input type="number" value={Math.round(selectedItems.components[0].position.y)} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { position: { ...selectedItems.components[0].position, y: parseFloat(e.target.value) || 0 } })} className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Rotation</label>
                  <div className="grid grid-cols-4 gap-1">{[0, 90, 180, 270].map(angle => (<button key={angle} onClick={() => updateComponentProps(selectedItems.components[0].id, { rotation: angle })} className={`py-2 rounded-lg border transition-all text-[10px] font-bold ${selectedItems.components[0].rotation === angle ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}>{angle}°</button>))}</div>
                </div>
                <hr className="border-zinc-800 my-2" />
                <button onClick={deleteSelected} className="w-full flex items-center justify-center gap-2 p-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-xs font-bold uppercase tracking-widest border border-red-500/20"><Trash2 size={16} /> Delete Component</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-700"><MousePointer2 size={32} className="text-zinc-700 mb-4" /><p className="text-sm font-medium text-zinc-500 text-center">Nothing selected</p></div>
        )}
      </div>
    </div>
  );
};

export default App;