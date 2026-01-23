import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { PCBComponent, Trace, Vector2 } from './types';
import { FOOTPRINTS, SNAP_SIZE, getFootprint } from './constants';
import { getPinGlobalPos, generateBezierPath, getPointOnBezier, checkCollision, getBezierControlPoints, findConnectedTraces } from './utils/pcbUtils';
import { exportToGRBL } from './utils/grblExporter';

import Canvas from './Canvas';
import Sidebar from './Sidebar';
import Inspector from './Inspector';
import Toolbar from './Toolbar';
import Modals from './Modals';

const App: React.FC = () => {
  const [components, setComponents] = useState<PCBComponent[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [invalidTraceIds, setInvalidTraceIds] = useState<Set<string>>(new Set());
  const [violationMarkers, setViolationMarkers] = useState<Vector2[]>([]);
  const [isDrcRunning, setIsDrcRunning] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<'none' | 'pass' | 'fail'>('none');
  const [modalMode, setModalMode] = useState<'ic' | 'header' | null>(null);
  const [headerPinCount, setHeaderPinCount] = useState(4);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [pendingFootprintId, setPendingFootprintId] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState<Vector2 | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.5 });
  const [history, setHistory] = useState<{components: PCBComponent[], traces: Trace[]}[]>([]);

  const dragRef = useRef<{
    type: 'move' | 'route' | 'pan' | 'marquee' | 'handle' | 'potential_split';
    id?: string;
    handleIdx?: 1 | 2;
    startWorld: Vector2;
    offset?: Vector2;
    hasMoved?: boolean;
    initialComp?: PCBComponent;
    groupInitialPositions?: Map<string, Vector2>;
  } | null>(null);
  const [routingPreview, setRoutingPreview] = useState<{path: string} | null>(null);
  const [marquee, setMarquee] = useState<{start: Vector2, end: Vector2} | null>(null);
  const boardRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allPins = useMemo(() => components.flatMap(comp => {
    const footprint = getFootprint(comp.footprintId);
    return footprint?.pins.map(p => ({
      ...p, id: `${comp.id}_${p.id}`, componentId: comp.id, globalPos: getPinGlobalPos(comp, p)
    })) || [];
  }), [components]);

  const selectedItems = useMemo(() => ({
    components: components.filter(c => selectedIds.has(c.id)),
    traces: traces.filter(t => selectedIds.has(t.id))
  }), [components, traces, selectedIds]);

  const saveToHistory = useCallback(() => setHistory(prev => [...prev, { components, traces }].slice(-50)), [components, traces]);
  
  const undo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setComponents(last.components); setTraces(last.traces); setSelectedIds(new Set());
  }, [history]);

  const snap = (v: number, isJunction: boolean = false) => {
    const grid = isJunction ? SNAP_SIZE / 2 : SNAP_SIZE;
    return Math.round(v / grid) * grid;
  };

  const getScreenToWorld = useCallback((clientX: number, clientY: number): Vector2 => {
    const svg = boardRef.current; const g = viewportRef.current;
    if (!svg || !g) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const worldPt = pt.matrixTransform(g.getScreenCTM()?.inverse());
    return { x: worldPt.x, y: worldPt.y };
  }, []);

  const centerView = useCallback(() => {
    const svg = boardRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (components.length === 0 && traces.length === 0) { setViewport({ x: rect.width / 2, y: rect.height / 2, scale: 0.5 }); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    components.forEach(c => {
      const f = getFootprint(c.footprintId); if (!f) return;
      minX = Math.min(minX, c.position.x); minY = Math.min(minY, c.position.y);
      maxX = Math.max(maxX, c.position.x + f.width); maxY = Math.max(maxY, c.position.y + f.height);
    });
    const wWidth = maxX - minX, wHeight = maxY - minY;
    const wCX = minX + wWidth / 2, wCY = minY + wHeight / 2;
    const scale = Math.min(rect.width / (wWidth + 150), rect.height / (wHeight + 150), 1.5);
    setViewport({ x: rect.width / 2 - wCX * scale, y: rect.height / 2 - wCY * scale, scale });
  }, [components, traces]);

  const runDRC = useCallback(() => {
    setIsDrcRunning(true);
    const invalid = new Set<string>(); 
    const markers: Vector2[] = [];
    const markedPairs = new Set<string>(); 
    const SAFETY_GAP = 6.0; 
    const PIN_PAD_RADIUS = 8.0; 
    
    const traceData = traces.map(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
      if (!p1 || !p2) return null;
      return { 
        id: t.id, 
        from: t.fromPinId, 
        to: t.toPinId, 
        width: t.width,
        pts: Array.from({ length: 20 }, (_, i) => getPointOnBezier(i / 19, p1.globalPos!, p2.globalPos!, t)) 
      };
    }).filter(d => d !== null);

    for (let i = 0; i < traceData.length; i++) {
      for (let j = i + 1; j < traceData.length; j++) {
        const a = traceData[i]!; const b = traceData[j]!;
        if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
        const pairKey = [a.id, b.id].sort().join('-');
        if (markedPairs.has(pairKey)) continue;
        const threshold = (a.width / 2) + (b.width / 2) + SAFETY_GAP;
        for (const pa of a.pts) {
          for (const pb of b.pts) {
            if (checkCollision(pa, pb, threshold)) {
              invalid.add(a.id); 
              invalid.add(b.id);
              markers.push({ x: (pa.x + pb.x)/2, y: (pa.y + pb.y)/2 });
              markedPairs.add(pairKey);
              break;
            }
          }
          if (markedPairs.has(pairKey)) break;
        }
      }
    }

    traceData.forEach(t => {
      const unrelatedPins = allPins.filter(p => p.id !== t.from && p.id !== t.to);
      const threshold = (t.width / 2) + PIN_PAD_RADIUS + SAFETY_GAP;
      let pinMarked = false;
      unrelatedPins.forEach(p => {
        if (pinMarked) return;
        for (const pt of t.pts) {
          if (checkCollision(pt, p.globalPos!, threshold)) {
            invalid.add(t.id);
            markers.push({ x: (pt.x + p.globalPos!.x)/2, y: (pt.y + p.globalPos!.y)/2 });
            pinMarked = true;
            break;
          }
        }
      });
    });

    setInvalidTraceIds(invalid); 
    setViolationMarkers(markers);
    setLastCheckResult(invalid.size > 0 ? 'fail' : (traces.length > 0 ? 'pass' : 'none'));
    setTimeout(() => setIsDrcRunning(false), 200);
  }, [traces, allPins]);

  useEffect(() => { const t = setTimeout(runDRC, 800); return () => clearTimeout(t); }, [traces, components, runDRC]);

  const loadExample = useCallback(() => {
    saveToHistory();
    const exampleComponents: PCBComponent[] = [
      { id: 'ex_nano', footprintId: 'arduino_nano', name: 'MCU1', position: { x: 400, y: 100 }, rotation: 0 },
      { id: 'ex_led', footprintId: 'led', name: 'L1', position: { x: 800, y: 150 }, rotation: 0 },
      { id: 'ex_res', footprintId: 'resistor', name: 'R1', position: { x: 750, y: 300 }, rotation: 90 },
      { id: 'ex_dip', footprintId: 'dip_8', name: 'U1', position: { x: 400, y: 600 }, rotation: 0 },
      { id: 'ex_cap', footprintId: 'capacitor_electrolytic', name: 'C1', position: { x: 1000, y: 500 }, rotation: 0 },
      { id: 'ex_head', footprintId: 'header_4', name: 'H1', position: { x: 100, y: 200 }, rotation: 0, locked: true },
      { id: 'ex_diode', footprintId: 'diode', name: 'D1', position: { x: 100, y: 500 }, rotation: 180 }
    ];

    const exampleTraces: Trace[] = [
      { id: 'tr_ex_1', fromPinId: 'ex_nano_p1', toPinId: 'ex_led_A', width: 8, color: '#3b82f6' },
      { id: 'tr_ex_2', fromPinId: 'ex_nano_p12', toPinId: 'ex_head_p1', width: 14, color: '#ef4444' },
      { id: 'tr_ex_3', fromPinId: 'ex_dip_p1', toPinId: 'ex_res_1', width: 6, color: '#10b981' },
      { id: 'tr_ex_4', fromPinId: 'ex_nano_p14', toPinId: 'ex_cap_2', width: 10, color: '#f59e0b', c1Offset: { x: 100, y: 50 }, c2Offset: { x: -50, y: 100 } },
      { id: 'tr_err_1', fromPinId: 'ex_dip_p2', toPinId: 'ex_led_K', width: 8, color: '#10b981' },
      { id: 'tr_err_2', fromPinId: 'ex_diode_A', toPinId: 'ex_nano_p15', width: 8, color: '#3b82f6' }
    ];

    setComponents(exampleComponents);
    setTraces(exampleTraces);
    setSelectedIds(new Set());
    setTimeout(() => centerView(), 100);
  }, [saveToHistory, centerView]);

  const getCompPosForPinTarget = (fId: string, target: Vector2, rotation: number) => {
    const foot = getFootprint(fId); if (!foot || !foot.pins[0]) return target;
    const rad = (rotation * Math.PI) / 180; const cos = Math.cos(rad); const sin = Math.sin(rad);
    const lx = foot.pins[0].localPos.x - foot.width/2, ly = foot.pins[0].localPos.y - foot.height/2;
    return { x: target.x - (lx * cos - ly * sin + foot.width/2), y: target.y - (lx * sin + ly * cos + foot.height/2) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    const world = getScreenToWorld(e.clientX, e.clientY);
    if (pendingFootprintId) {
      const foot = getFootprint(pendingFootprintId);
      if (foot) {
        saveToHistory();
        const pos = getCompPosForPinTarget(pendingFootprintId, { x: snap(world.x), y: snap(world.y) }, 0);
        const id = `comp_${Date.now()}`;
        setComponents(prev => [...prev, { id, footprintId: pendingFootprintId, name: foot.name.substring(0,3).toUpperCase() + (components.length+1), position: pos, rotation: 0 }]);
        setSelectedIds(new Set([id])); setPendingFootprintId(null); setPreviewPos(null);
      }
      return;
    }
    if (tool === 'pan' || e.button === 1) { dragRef.current = { type: 'pan', startWorld: { x: e.clientX, y: e.clientY } }; return; }

    const activeTraceIds = new Set(selectedIds);
    selectedIds.forEach(sid => {
      const comp = components.find(c => c.id === sid);
      if (comp?.footprintId === 'JUNCTION') {
        traces.forEach(t => { if (t.fromPinId.startsWith(sid) || t.toPinId.startsWith(sid)) activeTraceIds.add(t.id); });
      }
    });

    for (const traceId of activeTraceIds) {
      const t = traces.find(tr => tr.id === traceId);
      if (t) {
        const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
        if (p1 && p2) {
          const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(p1.globalPos!, p2.globalPos!, t);
          if (checkCollision({x: cx1, y: cy1}, world, 12)) {
            dragRef.current = { type: 'handle', id: t.id, handleIdx: 1, startWorld: world };
            saveToHistory(); return;
          }
          if (checkCollision({x: cx2, y: cy2}, world, 12)) {
            dragRef.current = { type: 'handle', id: t.id, handleIdx: 2, startWorld: world };
            saveToHistory(); return;
          }
        }
      }
    }

    const hitPin = allPins.find(p => checkCollision(p.globalPos!, world, 7));
    if (hitPin) {
      const comp = components.find(c => c.id === hitPin.componentId);
      if (comp?.footprintId !== 'JUNCTION') {
        dragRef.current = { type: 'route', id: hitPin.id, startWorld: world };
        return;
      }
    }

    const hitComps = components.filter(c => {
      const f = getFootprint(c.footprintId); if (!f) return false;
      const hitSlop = c.footprintId === 'JUNCTION' ? 18 : 0;
      return world.x >= c.position.x - hitSlop && world.x <= c.position.x + f.width + hitSlop && 
             world.y >= c.position.y - hitSlop && world.y <= c.position.y + f.height + hitSlop;
    }).map(c => c.id).reverse();

    const hitTraces = traces.filter(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
      if (!p1 || !p2) return false;
      for(let i=0; i<=20; i++) if(checkCollision(world, getPointOnBezier(i/20, p1.globalPos!, p2.globalPos!, t), 15)) return true;
      return false;
    }).map(t => t.id).reverse();

    const allHits = [...hitComps, ...hitTraces];
    if (allHits.length > 0) {
      let nextId = allHits[0];
      if (selectedIds.has(nextId) && !e.shiftKey) nextId = allHits[(allHits.findIndex(h => selectedIds.has(h)) + 1) % allHits.length];
      if (e.shiftKey) { const next = new Set(selectedIds); if (next.has(nextId)) next.delete(nextId); else next.add(nextId); setSelectedIds(next); }
      else if (!selectedIds.has(nextId)) setSelectedIds(new Set([nextId]));

      if (hitComps.includes(nextId)) {
        const comp = components.find(c => c.id === nextId);
        if (comp && comp.locked) {
           dragRef.current = null;
           return;
        }

        saveToHistory(); const map = new Map(); 
        if (selectedIds.has(nextId) && selectedIds.size > 1) { 
           components.forEach(c => { 
             if(selectedIds.has(c.id) && !c.locked) map.set(c.id, {...c.position}); 
           }); 
        }
        const pinRef = allPins.find(p => p.componentId === nextId);
        dragRef.current = { type: 'move', id: nextId, startWorld: world, offset: pinRef ? { x: world.x - pinRef.globalPos!.x, y: world.y - pinRef.globalPos!.y } : { x: 0, y: 0 }, groupInitialPositions: map.size > 0 ? map : undefined, hasMoved: false };
      } else if (hitTraces.includes(nextId)) {
        dragRef.current = { type: 'potential_split', id: nextId, startWorld: world, hasMoved: false };
      }
      return;
    }
    if (!e.shiftKey) setSelectedIds(new Set());
    dragRef.current = { type: 'marquee', startWorld: world };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = getScreenToWorld(e.clientX, e.clientY);
    if (pendingFootprintId) { setPreviewPos(world); return; }
    const drag = dragRef.current;
    
    const hp = allPins.find(p => checkCollision(p.globalPos!, world, 15));
    setHoveredPinId(hp?.id || null);
    
    const hc = components.find(c => {
      const f = getFootprint(c.footprintId);
      if(!f) return false;
      const slop = c.footprintId === 'JUNCTION' ? 18 : 10;
      return world.x >= c.position.x - slop && world.x <= c.position.x + f.width + slop &&
             world.y >= c.position.y - slop && world.y <= c.position.y + f.height + slop;
    });
    setHoveredCompId(hc?.id || null);

    if (!drag) return;

    if (drag.type === 'pan') {
      const dx = e.clientX - drag.startWorld.x; const dy = e.clientY - drag.startWorld.y;
      setViewport(v => ({ ...v, x: v.x + dx, y: v.y + dy })); drag.startWorld = { x: e.clientX, y: e.clientY };
    } else if (drag.type === 'handle') {
      setTraces(prev => prev.map(t => {
        if (t.id !== drag.id) return t;
        const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
        if (!p1 || !p2) return t;
        const base = drag.handleIdx === 1 ? p1.globalPos! : p2.globalPos!;
        const offset = { x: world.x - base.x, y: world.y - base.y };
        const updated = drag.handleIdx === 1 ? { ...t, c1Offset: offset } : { ...t, c2Offset: offset };
        
        const junctionPinId = drag.handleIdx === 1 ? t.fromPinId : t.toPinId;
        const junctionComp = components.find(c => junctionPinId.startsWith(c.id) && c.footprintId === 'JUNCTION');
        
        if (junctionComp && junctionComp.junctionType !== 'independent') {
          const neighbors = prev.filter(tr => tr.id !== t.id && (tr.fromPinId === junctionPinId || tr.toPinId === junctionPinId));
          if (neighbors.length === 1) {
            const n = neighbors[0];
            const isNFrom = n.fromPinId === junctionPinId;
            const currentNOffset = isNFrom ? (n.c1Offset || {x:0, y:0}) : (n.c2Offset || {x:0, y:0});
            
            let finalNOffset;
            if (junctionComp.junctionType === 'smooth') {
              // Mirrored
              finalNOffset = { x: -offset.x, y: -offset.y };
            } else {
              // Linear: flip direction, keep length
              const offsetLen = Math.hypot(offset.x, offset.y);
              if (offsetLen > 0.1) {
                const nLen = Math.hypot(currentNOffset.x, currentNOffset.y);
                finalNOffset = { 
                  x: (-offset.x / offsetLen) * nLen, 
                  y: (-offset.y / offsetLen) * nLen 
                };
              } else {
                finalNOffset = currentNOffset;
              }
            }
            
            setTimeout(() => {
              setTraces(curr => curr.map(tr => tr.id === n.id ? (isNFrom ? { ...tr, c1Offset: finalNOffset } : { ...tr, c2Offset: finalNOffset }) : tr));
            }, 0);
          }
        }
        return updated;
      }));
    } else if (drag.type === 'potential_split') {
      if (Math.hypot(world.x - drag.startWorld.x, world.y - drag.startWorld.y) > 10) {
        const t = traces.find(tr => tr.id === drag.id);
        if (t) {
          saveToHistory();
          
          const jId = `comp_junc_${Date.now()}`;
          const newJ: PCBComponent = { 
            id: jId, 
            footprintId: 'JUNCTION', 
            name: 'J' + (components.length + 1), 
            position: { x: world.x - 12.7, y: world.y - 12.7 }, 
            rotation: 0, 
            junctionType: 'smooth' 
          };
          
          const jPinId = `${jId}_p1`;
          const p1 = allPins.find(p => p.id === t.fromPinId);
          const p2 = allPins.find(p => p.id === t.toPinId);
          
          let offsetIn = { x: 0, y: 0 };
          let offsetOut = { x: 0, y: 0 };
          
          if (p1 && p2) {
             const dir = { x: p2.globalPos!.x - p1.globalPos!.x, y: p2.globalPos!.y - p1.globalPos!.y };
             const len = Math.hypot(dir.x, dir.y);
             if (len > 0.1) {
                const unit = { x: dir.x / len, y: dir.y / len };
                const tension = 30; 
                offsetIn = { x: -unit.x * tension, y: -unit.y * tension };
                offsetOut = { x: unit.x * tension, y: unit.y * tension };
             }
          }

          // CRITICAL FIX: Preserve original control point offsets at the ends to prevent breaking existing junction smoothness
          const s1 = { 
            id: `tr_${Date.now()}_1`, 
            fromPinId: t.fromPinId, 
            toPinId: jPinId, 
            width: t.width, 
            color: t.color, 
            c1Offset: t.c1Offset, 
            c2Offset: offsetIn 
          };
          const s2 = { 
            id: `tr_${Date.now()}_2`, 
            fromPinId: jPinId, 
            toPinId: t.toPinId, 
            width: t.width, 
            color: t.color, 
            c1Offset: offsetOut, 
            c2Offset: t.c2Offset 
          };
          
          setComponents(prev => [...prev, newJ]);
          setTraces(prev => [...prev.filter(tr => tr.id !== t.id), s1, s2]);
          setSelectedIds(new Set([jId]));
          
          // Switch to Move mode immediately. Offset is 0 because the component is already centered at world (cursor).
          dragRef.current = { 
            type: 'move', 
            id: jId, 
            startWorld: world, 
            offset: { x: 0, y: 0 }, 
            hasMoved: true, 
            initialComp: newJ 
          };
        }
      }
    } else if (drag.type === 'move') {
      const delta = { x: world.x - drag.startWorld.x, y: world.y - drag.startWorld.y };
      if (drag.groupInitialPositions) {
        const mi = drag.groupInitialPositions.get(drag.id!)!; 
        const isJ = components.find(c => c.id === drag.id)?.footprintId === 'JUNCTION' || drag.initialComp?.footprintId === 'JUNCTION';
        const snp = { x: snap(mi.x + delta.x, isJ), y: snap(mi.y + delta.y, isJ) };
        const fd = { x: snp.x - mi.x, y: snp.y - mi.y };
        setComponents(prev => prev.map(c => { 
          const ip = drag.groupInitialPositions!.get(c.id); 
          return (ip && !c.locked) ? { ...c, position: { x: ip.x + fd.x, y: ip.y + fd.y } } : c; 
        }));
      } else {
        const comp = components.find(c => c.id === drag.id) || drag.initialComp;
        if (comp && !comp.locked) {
          const isJ = comp.footprintId === 'JUNCTION';
          const target = { x: snap(world.x - (drag.offset?.x || 0), isJ), y: snap(world.y - (drag.offset?.y || 0), isJ) };
          setComponents(prev => prev.map(c => c.id === drag.id ? { ...c, position: getCompPosForPinTarget(comp.footprintId, target, comp.rotation) } : c));
        }
      }
    } else if (drag.type === 'route') {
      const sp = allPins.find(p => p.id === drag.id);
      if (sp) setRoutingPreview({ path: generateBezierPath(sp.globalPos!, (hp ? hp.globalPos! : world)) });
    } else if (drag.type === 'marquee') {
      setMarquee({ start: drag.startWorld, end: world });
      const minX = Math.min(drag.startWorld.x, world.x), maxX = Math.max(drag.startWorld.x, world.x), minY = Math.min(drag.startWorld.y, world.y), maxY = Math.max(drag.startWorld.y, world.y);
      const ics = components.filter(c => { const f = getFootprint(c.footprintId); return f && (c.position.x < maxX && c.position.x + f.width > minX && c.position.y < maxY && c.position.y + f.height > minY); }).map(c => c.id);
      const its = traces.filter(t => { const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId); return p1 && p2 && ((p1.globalPos!.x >= minX && p1.globalPos!.x <= maxX && p1.globalPos!.y >= minY && p1.globalPos!.y <= maxY) || (p2.globalPos!.x >= minX && p2.globalPos!.x <= maxX && p2.globalPos!.y >= minY && p2.globalPos!.y <= maxY)); }).map(t => t.id);
      setSelectedIds(new Set([...ics, ...its]));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.type === 'route' && routingPreview) {
      const world = getScreenToWorld(e.clientX, e.clientY);
      const ep = allPins.find(p => checkCollision(p.globalPos!, world, 15) && p.id !== drag.id);
      if (ep && drag.id) { 
        saveToHistory(); setTraces(prev => [...prev, { id: `tr_${Date.now()}`, fromPinId: drag.id!, toPinId: ep.id, width: 8, color: '#3b82f6' }]); 
      }
    }
    dragRef.current = null; setRoutingPreview(null); setMarquee(null); setHoveredPinId(null);
  };

  const onTraceDoubleClick = (traceId: string) => {
    const wholeTrace = findConnectedTraces(traceId, traces, components);
    setSelectedIds(new Set(wholeTrace));
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return; saveToHistory();
    const isJunc = components.find(c => selectedIds.has(c.id) && c.footprintId === 'JUNCTION');
    if (isJunc && selectedIds.size === 1) {
      const cts = traces.filter(t => t.fromPinId.startsWith(isJunc.id) || t.toPinId.startsWith(isJunc.id));
      if (cts.length === 2) {
        const sP = cts[0].fromPinId.startsWith(isJunc.id) ? cts[0].toPinId : cts[0].fromPinId;
        const eP = cts[1].fromPinId.startsWith(isJunc.id) ? cts[1].toPinId : cts[1].fromPinId;
        setTraces(prev => [...prev.filter(t => !cts.some(c => c.id === t.id)), { id: `tr_m_${Date.now()}`, fromPinId: sP, toPinId: eP, width: 8, color: '#3b82f6' }]);
        setComponents(prev => prev.filter(c => c.id !== isJunc.id)); setSelectedIds(new Set()); return;
      }
    }
    setComponents(prev => prev.filter(c => !selectedIds.has(c.id)));
    setTraces(prev => prev.filter(t => !selectedIds.has(t.id) && !selectedIds.has(allPins.find(p => p.id === t.fromPinId)?.componentId || '') && !selectedIds.has(allPins.find(p => p.id === t.toPinId)?.componentId || '')));
    setSelectedIds(new Set());
  }, [selectedIds, components, traces, saveToHistory, allPins]);

  const onUpdateTrace = (id: string, updates: Partial<Trace>) => {
    saveToHistory();
    setTraces(prev => prev.map(t => (t.id === id || selectedIds.has(t.id)) ? { ...t, ...updates } : t));
  };

  const onUpdateComponent = (id: string, updates: Partial<PCBComponent>) => {
    saveToHistory();
    setComponents(prev => prev.map(c => {
      if (c.id !== id) return c;
      const nextC = { ...c, ...updates };
      // If junction mode changed, realign connected traces immediately
      if (c.footprintId === 'JUNCTION' && (updates.junctionType === 'smooth' || updates.junctionType === 'linear')) {
        const pinId = `${id}_p1`;
        const connected = traces.filter(t => t.fromPinId === pinId || t.toPinId === pinId);
        if (connected.length === 2) {
          const t1 = connected[0], t2 = connected[1];
          const isT1From = t1.fromPinId === pinId;
          const isT2From = t2.fromPinId === pinId;
          const currentOffset = isT1From ? (t1.c1Offset || {x:0, y:0}) : (t1.c2Offset || {x:0, y:0});
          const nOffset = isT2From ? (t2.c1Offset || {x:0, y:0}) : (t2.c2Offset || {x:0, y:0});
          
          let alignedNOffset;
          if (updates.junctionType === 'smooth') {
            alignedNOffset = { x: -currentOffset.x, y: -currentOffset.y };
          } else {
            // Linear alignment
            const offsetLen = Math.hypot(currentOffset.x, currentOffset.y);
            if (offsetLen > 0.1) {
              const nLen = Math.hypot(nOffset.x, nOffset.y);
              alignedNOffset = { x: (-currentOffset.x / offsetLen) * nLen, y: (-currentOffset.y / offsetLen) * nLen };
            } else {
              alignedNOffset = nOffset;
            }
          }
          
          setTraces(curr => curr.map(tr => {
            if (tr.id === t2.id) return isT2From ? { ...tr, c1Offset: alignedNOffset } : { ...tr, c2Offset: alignedNOffset };
            return tr;
          }));
        }
      }
      return nextC;
    }));
  };

  const exportSVG = () => {
    const svg = boardRef.current; if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `pcb_${Date.now()}.svg`; a.click();
  };

  const exportGRBL = () => {
    const gcode = exportToGRBL(components, traces, allPins);
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `pcb_${Date.now()}.nc`; a.click();
  };

  return (
    <div className="flex h-screen w-full bg-[#050C07] text-zinc-200 overflow-hidden font-sans select-none">
      <Sidebar 
        pendingFootprintId={pendingFootprintId}
        onLibraryClick={(fid) => { if(fid==='dip') setModalMode('ic'); else if(fid==='header') setModalMode('header'); else setPendingFootprintId(fid); }}
        lastCheckResult={lastCheckResult} invalidTraceCount={invalidTraceIds.size}
        isDrcRunning={isDrcRunning} runDRC={runDRC}
        exportToSVG={exportSVG} exportToGRBL={exportGRBL}
        saveProject={() => {
          const blob = new Blob([JSON.stringify({components, traces})], {type: 'application/json'});
          const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `project_${Date.now()}.json`; a.click();
        }}
        loadProject={() => fileInputRef.current?.click()}
        loadExample={loadExample}
      />
      <div className="flex-1 relative overflow-hidden bg-[#050C07]">
        <Toolbar 
          tool={tool} setTool={setTool} undo={undo} canUndo={history.length > 0}
          centerView={centerView} rotateSelected={() => { saveToHistory(); setComponents(prev => prev.map(c => (selectedIds.has(c.id) && !c.locked) ? {...c, rotation: (c.rotation+90)%360} : c)); }}
          deleteSelected={deleteSelected} handleZoom={(d) => {
            const svg = boardRef.current; if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const cx = rect.width / 2, cy = rect.height / 2;
            setViewport(v => {
              const factor = d > 0 ? 1.15 : 0.85;
              const nextScale = Math.min(Math.max(v.scale * factor, 0.1), 5);
              const wx = (cx - v.x) / v.scale, wy = (cy - v.y) / v.scale;
              return { x: cx - wx * nextScale, y: cy - wy * nextScale, scale: nextScale };
            });
          }}
          scale={viewport.scale} selectionSize={selectedIds.size}
        />
        <Canvas 
          boardRef={boardRef} viewportRef={viewportRef} components={components} traces={traces}
          allPins={allPins} selectedIds={selectedIds} hoveredPinId={hoveredPinId}
          hoveredCompId={hoveredCompId} viewport={viewport} routingPreview={routingPreview}
          marquee={marquee} violationMarkers={violationMarkers} pendingFootprintId={pendingFootprintId}
          previewPos={previewPos} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onTraceDoubleClick={onTraceDoubleClick}
          onWheel={(e) => {
            const rect = boardRef.current?.getBoundingClientRect(); if (!rect) return;
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            setViewport(v => {
              const factor = e.deltaY < 0 ? 1.1 : 0.9;
              const nextScale = Math.min(Math.max(v.scale * factor, 0.1), 10);
              const wx = (mx - v.x) / v.scale, wy = (my - v.y) / v.scale;
              return { x: mx - wx * nextScale, y: my - wy * nextScale, scale: nextScale };
            });
          }}
          getFootprint={getFootprint} getCompPosForPinTarget={getCompPosForPinTarget}
        />
      </div>
      <Inspector 
        selectedComponents={selectedItems.components} selectedTraces={selectedItems.traces}
        hoveredCompId={hoveredCompId} onMouseEnterItem={setHoveredCompId}
        onUpdateComponent={onUpdateComponent}
        onUpdateTrace={onUpdateTrace}
        onRemoveItem={(id) => { saveToHistory(); setSelectedIds(new Set([id])); deleteSelected(); }}
        onClearSelection={() => setSelectedIds(new Set())}
        onIsolate={(id) => setSelectedIds(new Set([id]))}
        getFootprint={getFootprint} deleteSelected={deleteSelected}
      />
      <Modals 
        modalMode={modalMode} setModalMode={setModalMode} headerPinCount={headerPinCount}
        setHeaderPinCount={setHeaderPinCount} setPendingFootprintId={setPendingFootprintId}
      />
      <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if(!f) return;
        const r = new FileReader(); r.onload = (ev) => {
          const d = JSON.parse(ev.target?.result as string);
          if(d.components && d.traces) { saveToHistory(); setComponents(d.components); setTraces(d.traces); }
        }; r.readAsText(f);
      }} />
    </div>
  );
};

export default App;