
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { 
  PCBComponent, Trace, Vector2, Pin 
} from './types';
import { FOOTPRINTS, SNAP_SIZE } from './constants';
import { getPinGlobalPos, generateBezierPath, getPointOnBezier, checkCollision, getBezierControlPoints } from './utils/pcbUtils';
import { exportToGRBL } from './utils/grblExporter';
import { 
  Trash2, 
  Download, 
  RotateCw, 
  Layers,
  CircuitBoard,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Plus,
  Hand,
  Settings2,
  X,
  MousePointerSquareDashed,
  Spline,
  Activity,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2
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
    type: 'move' | 'route' | 'pan' | 'marquee' | 'handle';
    id?: string;
    handleIdx?: 1 | 2;
    startWorld: Vector2;
    offset?: Vector2;
  } | null>(null);

  const [routingPreview, setRoutingPreview] = useState<{from: Vector2, to: Vector2, path: string} | null>(null);
  const [marquee, setMarquee] = useState<{start: Vector2, end: Vector2} | null>(null);

  const boardRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);

  // --- Helpers ---
  const snap = (v: number) => Math.round(v / SNAP_SIZE) * SNAP_SIZE;

  // Uses SVG's own coordinate system matrices for 100% accurate coordinate mapping
  const getScreenToWorld = useCallback((clientX: number, clientY: number): Vector2 => {
    const svg = boardRef.current;
    const g = viewportRef.current;
    if (!svg || !g) return { x: 0, y: 0 };
    
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    
    // Transform the screen point to the local coordinate system of the viewport group
    const worldPt = pt.matrixTransform(g.getScreenCTM()?.inverse());
    return { x: worldPt.x, y: worldPt.y };
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

  // --- DRC ---
  const runDRC = useCallback(() => {
    setIsDrcRunning(true);
    const invalid = new Set<string>();
    const markers: Vector2[] = [];
    const clearance = SNAP_SIZE * 0.4;

    const traceData = traces.map(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId);
      const p2 = allPins.find(p => p.id === t.toPinId);
      if (!p1 || !p2) return null;
      return {
        id: t.id, from: t.fromPinId, to: t.toPinId,
        pts: Array.from({ length: 20 }, (_, i) => getPointOnBezier(i / 19, p1.globalPos, p2.globalPos, t))
      };
    }).filter(d => d !== null);

    for (let i = 0; i < traceData.length; i++) {
      for (let j = i + 1; j < traceData.length; j++) {
        const a = traceData[i]!;
        const b = traceData[j]!;
        const connected = a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
        if (connected) continue;

        for (const pa of a.pts) {
          for (const pb of b.pts) {
            if (checkCollision(pa, pb, clearance + 10)) {
              invalid.add(a.id); invalid.add(b.id);
              if (markers.length < 15) markers.push({ x: (pa.x + pb.x)/2, y: (pa.y + pb.y)/2 });
            }
          }
        }
      }
    }

    components.forEach(c => {
        const foot = FOOTPRINTS.find(f => f.id === c.footprintId);
        if(!foot) return;
        traceData.forEach(t => {
            t.pts.forEach(pt => {
                foot.pins.forEach(pin => {
                    const pinId = `${c.id}_${pin.id}`;
                    if (t.from === pinId || t.to === pinId) return;
                    const pinPos = getPinGlobalPos(c, pin);
                    if(checkCollision(pt, pinPos, clearance + 5)) {
                        invalid.add(t.id);
                        markers.push(pt);
                    }
                });
            });
        });
    });

    setInvalidTraceIds(invalid);
    setViolationMarkers(markers);
    setLastCheckResult(invalid.size > 0 ? 'fail' : 'pass');
    setTimeout(() => setIsDrcRunning(false), 300);
  }, [traces, allPins, components]);

  useEffect(() => {
    const timeout = setTimeout(runDRC, 500);
    return () => clearTimeout(timeout);
  }, [traces, components, runDRC]);

  // --- Interaction Handlers ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    const world = getScreenToWorld(e.clientX, e.clientY);

    if (pendingFootprintId) {
      const foot = FOOTPRINTS.find(f => f.id === pendingFootprintId);
      if (foot) {
        const pos = { x: snap(world.x - foot.width / 2), y: snap(world.y - foot.height / 2) };
        const id = `comp_${Date.now()}`;
        setComponents(prev => [...prev, {
          id, footprintId: pendingFootprintId, name: foot.name.split(' ')[0].substring(0,3).toUpperCase() + (components.length+1),
          position: pos, rotation: 0
        }]);
        setSelectedIds(new Set([id]));
        setPendingFootprintId(null);
        setPreviewPos(null);
      }
      return;
    }

    if (tool === 'pan' || e.button === 1) {
      dragRef.current = { type: 'pan', startWorld: { x: e.clientX, y: e.clientY } };
      return;
    }

    // Accurate hit-test for pins (max radius 12 world units to avoid overlaps on dense headers)
    const hitPin = allPins.find(p => checkCollision(p.globalPos, world, 12));
    if (hitPin && tool === 'select') {
      dragRef.current = { type: 'route', id: hitPin.id, startWorld: world };
      return;
    }

    for (const tId of selectedIds) {
      const trace = traces.find(t => t.id === tId);
      if (trace) {
        const p1 = allPins.find(p => p.id === trace.fromPinId);
        const p2 = allPins.find(p => p.id === trace.toPinId);
        if (p1 && p2) {
          const ctrl = getBezierControlPoints(p1.globalPos, p2.globalPos, trace);
          if (checkCollision(world, { x: ctrl.cx1, y: ctrl.cy1 }, 20)) {
            dragRef.current = { type: 'handle', id: tId, handleIdx: 1, startWorld: world };
            return;
          }
          if (checkCollision(world, { x: ctrl.cx2, y: ctrl.cy2 }, 20)) {
            dragRef.current = { type: 'handle', id: tId, handleIdx: 2, startWorld: world };
            return;
          }
        }
      }
    }

    const hitComp = [...components].reverse().find(c => {
      const foot = FOOTPRINTS.find(f => f.id === c.footprintId);
      return foot && world.x >= c.position.x && world.x <= c.position.x + foot.width &&
                   world.y >= c.position.y && world.y <= c.position.y + foot.height;
    });

    if (hitComp) {
      setSelectedIds(new Set([hitComp.id]));
      dragRef.current = { 
        type: 'move', id: hitComp.id, startWorld: world, 
        offset: { x: world.x - hitComp.position.x, y: world.y - hitComp.position.y } 
      };
      return;
    }

    const hitTrace = traces.find(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId);
      const p2 = allPins.find(p => p.id === t.toPinId);
      if (!p1 || !p2) return false;
      for (let i = 0; i <= 10; i++) {
        const pt = getPointOnBezier(i / 10, p1.globalPos, p2.globalPos, t);
        if (checkCollision(world, pt, 20)) return true;
      }
      return false;
    });

    if (hitTrace) {
      setSelectedIds(new Set([hitTrace.id]));
      return;
    }

    dragRef.current = { type: 'marquee', startWorld: world };
    setSelectedIds(new Set());
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = getScreenToWorld(e.clientX, e.clientY);
    
    // Accurately detect hovering over a pin (radius restricted to prevent ambiguity)
    const hovering = allPins.find(p => checkCollision(p.globalPos, world, 12));
    setHoveredPinId(hovering ? hovering.id : null);

    if (pendingFootprintId) {
      const foot = FOOTPRINTS.find(f => f.id === pendingFootprintId);
      if (foot) setPreviewPos({ x: snap(world.x - foot.width / 2), y: snap(world.y - foot.height / 2) });
      return;
    }

    if (!dragRef.current) return;
    const d = dragRef.current;

    switch (d.type) {
      case 'pan':
        setViewport(v => ({ 
          ...v, 
          x: v.x + (e.clientX - d.startWorld.x), 
          y: v.y + (e.clientY - d.startWorld.y) 
        }));
        dragRef.current!.startWorld = { x: e.clientX, y: e.clientY };
        break;
      case 'move':
        if (d.id && d.offset) {
          const next = { x: snap(world.x - d.offset.x), y: snap(world.y - d.offset.y) };
          setComponents(prev => prev.map(c => c.id === d.id ? { ...c, position: next } : c));
        }
        break;
      case 'route':
        const startPin = allPins.find(p => p.id === d.id);
        if (startPin) {
            const path = generateBezierPath(startPin.globalPos, world);
            setRoutingPreview({ from: startPin.globalPos, to: world, path });
        }
        break;
      case 'handle':
        if (d.id && d.handleIdx) {
          const trace = traces.find(t => t.id === d.id);
          const p1 = allPins.find(p => p.id === trace?.fromPinId);
          const p2 = allPins.find(p => p.id === trace?.toPinId);
          if (p1 && p2) {
            const anchor = d.handleIdx === 1 ? p1.globalPos : p2.globalPos;
            const key = d.handleIdx === 1 ? 'c1Offset' : 'c2Offset';
            setTraces(prev => prev.map(t => t.id === d.id ? { ...t, [key]: { x: world.x - anchor.x, y: world.y - anchor.y } } : t));
          }
        }
        break;
      case 'marquee':
        setMarquee({ start: d.startWorld, end: world });
        break;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const world = getScreenToWorld(e.clientX, e.clientY);

    if (d.type === 'route' && d.id) {
      const endPin = allPins.find(p => p.id !== d.id && checkCollision(p.globalPos, world, 12));
      if (endPin) {
        setTraces(prev => [...prev, {
          id: `trace_${Date.now()}`, fromPinId: d.id!, toPinId: endPin.id, width: 8, color: '#10b981'
        }]);
      }
    } else if (d.type === 'marquee' && marquee) {
      const x1 = Math.min(marquee.start.x, marquee.end.x);
      const x2 = Math.max(marquee.start.x, marquee.end.x);
      const y1 = Math.min(marquee.start.y, marquee.end.y);
      const y2 = Math.max(marquee.start.y, marquee.end.y);
      const newSel = new Set<string>();
      components.forEach(c => {
        if (c.position.x >= x1 && c.position.x <= x2 && c.position.y >= y1 && c.position.y <= y2) newSel.add(c.id);
      });
      traces.forEach(t => {
        const p1 = allPins.find(p => p.id === t.fromPinId);
        if (p1 && p1.globalPos.x >= x1 && p1.globalPos.x <= x2 && p1.globalPos.y >= y1 && p1.globalPos.y <= y2) newSel.add(t.id);
      });
      setSelectedIds(newSel);
    }

    dragRef.current = null;
    setRoutingPreview(null);
    setMarquee(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextScale = Math.min(Math.max(viewport.scale * factor, 0.1), 3);
    
    const svg = boardRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const worldX = (mouseX - viewport.x) / viewport.scale;
      const worldY = (mouseY - viewport.y) / viewport.scale;
      
      setViewport({
        x: mouseX - worldX * nextScale,
        y: mouseY - worldY * nextScale,
        scale: nextScale
      });
    }
  };

  const activeComp = selectedIds.size === 1 ? components.find(c => selectedIds.has(c.id)) : null;
  const activeTrace = selectedIds.size === 1 ? traces.find(t => selectedIds.has(t.id)) : null;

  return (
    <div className="flex h-screen bg-[#07100a] text-emerald-50 overflow-hidden font-sans select-none touch-none">
      <aside className="w-72 bg-[#0a1a0f] border-r border-emerald-900/30 flex flex-col shadow-2xl z-40">
        <div className="p-6 border-b border-emerald-900/20">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20"><CircuitBoard size={24} className="text-white" /></div>
            <h1 className="text-xl font-black tracking-tight text-white italic">CircuitFlow</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setTool('select'); setPendingFootprintId(null); }} className={`flex-1 p-3 rounded-xl border transition-all ${tool === 'select' && !pendingFootprintId ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-[#0d2315] border-emerald-900/50 text-emerald-700 hover:text-emerald-500'}`} title="Selection Tool"><MousePointer2 size={18} className="mx-auto"/></button>
            <button onClick={() => { setTool('pan'); setPendingFootprintId(null); }} className={`flex-1 p-3 rounded-xl border transition-all ${tool === 'pan' ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-[#0d2315] border-emerald-900/50 text-emerald-700 hover:text-emerald-500'}`} title="Pan Tool"><Hand size={18} className="mx-auto"/></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-emerald-700 px-2 flex justify-between items-center">
                Check Board
                <Activity size={12} />
            </label>
            <button 
                onClick={runDRC} 
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all active:scale-95 ${isDrcRunning ? 'opacity-50 pointer-events-none' : ''} ${lastCheckResult === 'fail' ? 'bg-rose-600/10 border-rose-500 text-rose-500' : 'bg-emerald-600/10 border-emerald-500/50 text-emerald-500 hover:bg-emerald-600/20'}`}
            >
                <ShieldCheck size={16} /> 
                {isDrcRunning ? 'Checking...' : 'Run DRC Check'}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-emerald-700 px-2 block">Footprints</label>
            <div className="grid grid-cols-1 gap-2">
                {FOOTPRINTS.filter(f => f.id !== 'junction').map(f => (
                    <button key={f.id} onClick={() => { setPendingFootprintId(f.id); setTool('select'); setSelectedIds(new Set()); }} className={`w-full group flex items-center justify-between p-3 rounded-xl border transition-all ${pendingFootprintId === f.id ? 'bg-emerald-500/20 border-emerald-400' : 'bg-[#0d2315] hover:bg-[#112d1c] border-emerald-900/50'}`}>
                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold text-emerald-100">{f.name}</span>
                        <span className="text-[8px] text-emerald-800 uppercase font-black">{f.pins.length} Pins</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-emerald-900/30 group-hover:bg-emerald-500 transition-colors">
                        <Plus size={14} className="text-emerald-400 group-hover:text-white" />
                    </div>
                    </button>
                ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-emerald-900/20">
          <button onClick={() => {
            const gcode = exportToGRBL(components, traces, allPins as any);
            const blob = new Blob([gcode], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = 'board.nc'; link.click();
          }} className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-900/20 transition-all active:scale-95">
            <Download size={16} /> Export GRBL
          </button>
        </div>
      </aside>

      <main className="flex-1 relative bg-[#050c07] overflow-hidden" 
            onPointerDown={onPointerDown} 
            onPointerMove={onPointerMove} 
            onPointerUp={onPointerUp} 
            onWheel={onWheel}>
        <svg ref={boardRef} className="w-full h-full">
          <defs>
            <pattern id="grid-dots" width={SNAP_SIZE} height={SNAP_SIZE} patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1.2" fill="#152b1b" />
            </pattern>
            <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-dots)" />

          <g ref={viewportRef} transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
            {/* Traces */}
            {traces.map(t => {
              const p1 = allPins.find(p => p.id === t.fromPinId);
              const p2 = allPins.find(p => p.id === t.toPinId);
              if (!p1 || !p2) return null;
              const isSel = selectedIds.has(t.id);
              const isErr = invalidTraceIds.has(t.id);
              const path = generateBezierPath(p1.globalPos, p2.globalPos, t);
              return (
                <g key={t.id}>
                  <path 
                    d={path} 
                    fill="none" 
                    stroke={isSel ? '#34d399' : (isErr ? '#ef4444' : '#10b981')} 
                    strokeWidth={isSel ? t.width + 6 : t.width} 
                    strokeLinecap="round" 
                    opacity={isSel ? 1 : 0.8} 
                    className="transition-all duration-200"
                    filter={isSel ? 'url(#glow)' : ''}
                  />
                  <path d={path} fill="none" stroke="transparent" strokeWidth={40} className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); setSelectedIds(new Set([t.id])); }} />
                </g>
              );
            })}

            {/* Components */}
            {components.map(c => {
              const foot = FOOTPRINTS.find(f => f.id === c.footprintId);
              if (!foot) return null;
              const isSel = selectedIds.has(c.id);
              return (
                <g key={c.id} transform={`translate(${c.position.x}, ${c.position.y}) rotate(${c.rotation}, ${foot.width/2}, ${foot.height/2})`}>
                  <rect width={foot.width} height={foot.height} fill={isSel ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255,255,255,0.03)'} stroke={isSel ? '#34d399' : '#1a4a23'} strokeWidth={isSel ? 5 : 2} rx={6} className="transition-all" />
                  {foot.pins.map(p => (
                    <g key={p.id}>
                        <circle cx={p.localPos.x} cy={p.localPos.y} r={9} fill="#fcd34d" stroke={hoveredPinId === `${c.id}_${p.id}` ? 'white' : '#0a1a0f'} strokeWidth={2.5} />
                        <circle cx={p.localPos.x} cy={p.localPos.y} r={4} fill="#0a1a0f" />
                    </g>
                  ))}
                  <text x={foot.width/2} y={-14} textAnchor="middle" fill="#34d399" className="text-[12px] font-black uppercase tracking-widest">{c.name}</text>
                </g>
              );
            })}

            {/* Hover Tooltip (Centered on accurate pin global pos) */}
            {hoveredPinId && (
              <g transform={`translate(${allPins.find(p => p.id === hoveredPinId)?.globalPos.x}, ${allPins.find(p => p.id === hoveredPinId)?.globalPos.y})`}>
                <rect x={16} y={-30} width={70} height={20} rx={6} fill="#0a1a0f" stroke="#10b981" strokeWidth={1.5} filter="url(#glow)" />
                <text x={22} y={-15} fill="#10b981" className="text-[10px] font-black uppercase pointer-events-none">
                  {allPins.find(p => p.id === hoveredPinId)?.name}
                </text>
              </g>
            )}

            {previewPos && pendingFootprintId && (
              <g transform={`translate(${previewPos.x}, ${previewPos.y})`} className="opacity-60 pointer-events-none">
                <rect width={FOOTPRINTS.find(f => f.id === pendingFootprintId)!.width} height={FOOTPRINTS.find(f => f.id === pendingFootprintId)!.height} fill="rgba(52, 211, 153, 0.4)" stroke="#34d399" strokeWidth={4} rx={6} strokeDasharray="10, 5" />
              </g>
            )}

            {routingPreview && (
                <path 
                    d={routingPreview.path} 
                    stroke="#fcd34d" 
                    strokeWidth={6} 
                    strokeDasharray="12, 8" 
                    fill="none" 
                    opacity={0.8}
                />
            )}
            
            {marquee && <rect x={Math.min(marquee.start.x, marquee.end.x)} y={Math.min(marquee.start.y, marquee.end.y)} width={Math.abs(marquee.start.x - marquee.end.x)} height={Math.abs(marquee.start.y - marquee.end.y)} fill="rgba(52, 211, 153, 0.15)" stroke="#34d399" strokeWidth={1} strokeDasharray="5" />}

            {traces.map(t => {
              if (!selectedIds.has(t.id)) return null;
              const p1 = allPins.find(p => p.id === t.fromPinId);
              const p2 = allPins.find(p => p.id === t.toPinId);
              if (!p1 || !p2) return null;
              const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(p1.globalPos, p2.globalPos, t);
              return (
                <g key={`h-${t.id}`}>
                  <line x1={p1.globalPos.x} y1={p1.globalPos.y} x2={cx1} y2={cy1} stroke="#10b981" strokeWidth={1} strokeDasharray="5" opacity={0.5} />
                  <line x1={p2.globalPos.x} y1={p2.globalPos.y} x2={cx2} y2={cy2} stroke="#10b981" strokeWidth={1} strokeDasharray="5" opacity={0.5} />
                  <circle cx={cx1} cy={cy1} r={14} fill="#10b981" stroke="white" strokeWidth={2} className="cursor-pointer transition-transform hover:scale-110" onPointerDown={(e) => { e.stopPropagation(); dragRef.current = { type: 'handle', id: t.id, handleIdx: 1, startWorld: getScreenToWorld(e.clientX, e.clientY) }; }} />
                  <circle cx={cx2} cy={cy2} r={14} fill="#10b981" stroke="white" strokeWidth={2} className="cursor-pointer transition-transform hover:scale-110" onPointerDown={(e) => { e.stopPropagation(); dragRef.current = { type: 'handle', id: t.id, handleIdx: 2, startWorld: getScreenToWorld(e.clientX, e.clientY) }; }} />
                </g>
              );
            })}

            {violationMarkers.map((m, i) => (
              <g key={`v-${i}`} transform={`translate(${m.x}, ${m.y})`}>
                  <circle r={25} fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" strokeWidth={2} strokeDasharray="4,2" className="animate-pulse" />
                  <AlertTriangle size={16} x={-8} y={-8} className="text-rose-500" />
              </g>
            ))}
          </g>
        </svg>

        <div className="absolute top-6 left-6 flex flex-col gap-2 bg-[#0a1a0f]/90 backdrop-blur-md p-2 rounded-2xl border border-emerald-900/40 shadow-2xl">
          <button onClick={() => {
            const center = { x: boardRef.current!.clientWidth / 2, y: boardRef.current!.clientHeight / 2 };
            const nextScale = Math.min(viewport.scale * 1.25, 3);
            const worldX = (center.x - viewport.x) / viewport.scale;
            const worldY = (center.y - viewport.y) / viewport.scale;
            setViewport({ x: center.x - worldX * nextScale, y: center.y - worldY * nextScale, scale: nextScale });
          }} className="p-3 text-emerald-500 hover:text-emerald-300 transition-colors"><ZoomIn size={22}/></button>
          <div className="h-px bg-emerald-900/30 mx-2" />
          <button onClick={() => {
            const center = { x: boardRef.current!.clientWidth / 2, y: boardRef.current!.clientHeight / 2 };
            const nextScale = Math.max(viewport.scale / 1.25, 0.1);
            const worldX = (center.x - viewport.x) / viewport.scale;
            const worldY = (center.y - viewport.y) / viewport.scale;
            setViewport({ x: center.x - worldX * nextScale, y: center.y - worldY * nextScale, scale: nextScale });
          }} className="p-3 text-emerald-500 hover:text-emerald-300 transition-colors"><ZoomOut size={22}/></button>
        </div>
      </main>

      <aside className="w-80 bg-[#0a1a0f] border-l border-emerald-900/30 flex flex-col shadow-2xl z-40">
        <div className="p-6 border-b border-emerald-900/20 flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Board Inspector</h2>
            {lastCheckResult === 'pass' && <CheckCircle2 size={16} className="text-emerald-500" />}
            {lastCheckResult === 'fail' && <AlertTriangle size={16} className="text-rose-500 animate-bounce" />}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {activeComp ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black text-emerald-700 tracking-widest">Designator</label>
                <input type="text" value={activeComp.name} onChange={(e) => setComponents(prev => prev.map(c => c.id === activeComp.id ? {...c, name: e.target.value} : c))} className="w-full bg-[#050c07] border border-emerald-900/50 rounded-xl px-4 py-3 text-emerald-100 font-bold focus:border-emerald-500 transition-colors outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-emerald-700 tracking-widest">X Pos (mm)</label>
                  <input type="number" step={SNAP_SIZE} value={Math.round(activeComp.position.x)} onChange={(e) => setComponents(prev => prev.map(c => c.id === activeComp.id ? {...c, position: {...c.position, x: Number(e.target.value)}} : c))} className="w-full bg-[#050c07] border border-emerald-900/50 rounded-xl px-4 py-3 text-emerald-100 text-sm font-bold outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-emerald-700 tracking-widest">Y Pos (mm)</label>
                  <input type="number" step={SNAP_SIZE} value={Math.round(activeComp.position.y)} onChange={(e) => setComponents(prev => prev.map(c => c.id === activeComp.id ? {...c, position: {...c.position, y: Number(e.target.value)}} : c))} className="w-full bg-[#050c07] border border-emerald-900/50 rounded-xl px-4 py-3 text-emerald-100 text-sm font-bold outline-none" />
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] uppercase font-black text-emerald-700 tracking-widest">Rotation ({activeComp.rotation}°)</label>
                <div className="flex items-center gap-4">
                  <input type="range" min="0" max="270" step="90" value={activeComp.rotation} onChange={(e) => setComponents(prev => prev.map(c => c.id === activeComp.id ? {...c, rotation: Number(e.target.value)} : c))} className="flex-1 h-2 bg-[#050c07] rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  <button onClick={() => setComponents(prev => prev.map(c => c.id === activeComp.id ? {...c, rotation: (c.rotation + 90) % 360} : c))} className="p-3 bg-emerald-900/20 rounded-xl border border-emerald-900/50 text-emerald-400 hover:text-emerald-200 transition-all active:scale-90"><RotateCw size={18}/></button>
                </div>
              </div>
              <button onClick={() => {
                setComponents(prev => prev.filter(c => c.id !== activeComp.id));
                setTraces(prev => prev.filter(t => !t.fromPinId.startsWith(activeComp.id) && !t.toPinId.startsWith(activeComp.id)));
                setSelectedIds(new Set());
              }} className="w-full flex items-center justify-center gap-2 py-4 bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-600/30 rounded-xl font-black text-xs uppercase tracking-widest transition-all"><Trash2 size={16} /> Delete Component</button>
            </div>
          ) : activeTrace ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-3 mb-2 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                <div className="p-2 bg-amber-500/10 rounded-lg"><Spline size={20} className="text-amber-500" /></div>
                <div>
                    <h3 className="text-xs font-black text-emerald-50 uppercase tracking-widest">Trace Editor</h3>
                    <p className="text-[9px] text-emerald-700 uppercase font-black">Curved Path</p>
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] uppercase font-black text-emerald-700 tracking-widest flex justify-between">
                  Track Width <span>{activeTrace.width} px</span>
                </label>
                <input 
                  type="range" min="4" max="48" step="4" 
                  value={activeTrace.width} 
                  onChange={(e) => setTraces(prev => prev.map(t => t.id === activeTrace.id ? {...t, width: Number(e.target.value)} : t))} 
                  className="w-full h-2 bg-[#050c07] rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                />
              </div>
              <div className="p-4 bg-[#0d2315] border border-emerald-900/30 rounded-xl space-y-4 shadow-inner">
                 <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest">From Pin</span>
                    <span className="text-[10px] font-black text-emerald-400 p-1 px-2 bg-black/30 rounded">{allPins.find(p => p.id === activeTrace.fromPinId)?.name}</span>
                 </div>
                 <div className="h-px bg-emerald-900/20" />
                 <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest">To Pin</span>
                    <span className="text-[10px] font-black text-emerald-400 p-1 px-2 bg-black/30 rounded">{allPins.find(p => p.id === activeTrace.toPinId)?.name}</span>
                 </div>
              </div>
              <button onClick={() => {
                setTraces(prev => prev.filter(t => t.id !== activeTrace.id));
                setSelectedIds(new Set());
              }} className="w-full flex items-center justify-center gap-2 py-4 bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-600/30 rounded-xl font-black text-xs uppercase tracking-widest transition-all"><Trash2 size={16} /> Delete Trace</button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full opacity-30 space-y-4 text-center">
              <div className="p-8 border-2 border-dashed border-emerald-900/30 rounded-3xl">
                <Settings2 size={64} className="text-emerald-700" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">No Selection</p>
            </div>
          )}
        </div>

        <div className={`p-6 border-t border-emerald-900/20 flex items-center gap-4 transition-colors ${invalidTraceIds.size > 0 ? 'bg-rose-950/20' : 'bg-[#050c07]'}`}>
          <div className={`w-3 h-3 rounded-full shadow-lg ${invalidTraceIds.size > 0 ? 'bg-rose-500 animate-pulse shadow-rose-500/30' : 'bg-emerald-500 shadow-emerald-500/30'}`}></div>
          <div className="flex-1">
            <p className={`text-[10px] font-black uppercase tracking-widest ${invalidTraceIds.size > 0 ? 'text-rose-500' : 'text-emerald-700'} truncate`}>
                {invalidTraceIds.size > 0 ? `${invalidTraceIds.size} DRC FAULTS` : 'DESIGN HEALTH: OK'}
            </p>
          </div>
          {invalidTraceIds.size > 0 && <AlertTriangle size={14} className="text-rose-500" />}
        </div>
      </aside>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a4a23; border-radius: 10px; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-in { animation: fade-in 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default App;
