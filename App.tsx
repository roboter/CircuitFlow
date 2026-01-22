
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { 
  PCBComponent, Trace, Vector2 
} from './types';
import { FOOTPRINTS, SNAP_SIZE, getFootprint } from './constants';
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
  Layers,
  Zap,
  Circle,
  RefreshCw,
  FileCode,
  X,
  Eye,
  Undo2,
  Target,
  Hash,
  SlidersHorizontal,
  Save,
  Upload
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
  
  // --- UI State ---
  const [modalMode, setModalMode] = useState<'ic' | 'header' | null>(null);
  const [headerPinCount, setHeaderPinCount] = useState(4);

  // --- Undo History ---
  const [history, setHistory] = useState<{components: PCBComponent[], traces: Trace[]}[]>([]);

  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev, { components, traces }].slice(-50)); // Keep last 50 steps
  }, [components, traces]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setComponents(last.components);
    setTraces(last.traces);
    setSelectedIds(new Set());
  }, [history]);
  
  // --- Interaction State ---
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [pendingFootprintId, setPendingFootprintId] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState<Vector2 | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.5 });
  
  const dragRef = useRef<{
    type: 'move' | 'route' | 'pan' | 'marquee' | 'handle' | 'potential_split';
    id?: string;
    handleIdx?: 1 | 2;
    startWorld: Vector2;
    offset?: Vector2;
    hasMoved?: boolean;
    initialComp?: Partial<PCBComponent> & { footprintId: string; rotation: number };
  } | null>(null);

  const [routingPreview, setRoutingPreview] = useState<{from: Vector2, to: Vector2, path: string} | null>(null);
  const [marquee, setMarquee] = useState<{start: Vector2, end: Vector2} | null>(null);

  const boardRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---
  const snap = (v: number, isJunction: boolean = false) => {
    const grid = isJunction ? SNAP_SIZE / 2 : SNAP_SIZE;
    return Math.round(v / grid) * grid;
  };

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

  // --- Global Pin Mapping ---
  const allPins = useMemo(() => {
    return components.flatMap(comp => {
      const footprint = getFootprint(comp.footprintId);
      return footprint?.pins.map(p => ({
        ...p,
        id: `${comp.id}_${p.id}`,
        componentId: comp.id,
        globalPos: getPinGlobalPos(comp, p)
      })) || [];
    });
  }, [components]);

  const handleZoom = useCallback((delta: number, centerX?: number, centerY?: number) => {
    setViewport(prev => {
      const scaleFactor = 1.15;
      const zoomIn = delta > 0;
      const newScale = zoomIn ? prev.scale * scaleFactor : prev.scale / scaleFactor;
      const clampedScale = Math.min(Math.max(newScale, 0.05), 10);
      
      if (clampedScale === prev.scale) return prev;
      let cx = centerX ?? (window.innerWidth / 2);
      let cy = centerY ?? (window.innerHeight / 2);

      const svg = boardRef.current;
      const rect = svg?.getBoundingClientRect() || { left: 0, top: 0 };
      const localX = cx - rect.left;
      const localY = cy - rect.top;
      const worldX = (localX - prev.x) / prev.scale;
      const worldY = (localY - prev.y) / prev.scale;
      return { x: localX - worldX * clampedScale, y: localY - worldY * clampedScale, scale: clampedScale };
    });
  }, []);

  const centerView = useCallback(() => {
    const svg = boardRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    
    if (components.length === 0 && traces.length === 0) {
      setViewport({ x: rect.width / 2, y: rect.height / 2, scale: 0.5 });
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    components.forEach(c => {
      const foot = getFootprint(c.footprintId);
      if (!foot) return;
      minX = Math.min(minX, c.position.x);
      minY = Math.min(minY, c.position.y);
      maxX = Math.max(maxX, c.position.x + foot.width);
      maxY = Math.max(maxY, c.position.y + foot.height);
    });

    traces.forEach(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId);
      const p2 = allPins.find(p => p.id === t.toPinId);
      if (p1 && p2) {
        minX = Math.min(minX, p1.globalPos.x, p2.globalPos.x);
        minY = Math.min(minY, p1.globalPos.y, p2.globalPos.y);
        maxX = Math.max(maxX, p1.globalPos.x, p2.globalPos.x);
        maxY = Math.max(maxY, p1.globalPos.y, p2.globalPos.y);
      }
    });

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;
    const worldCenterX = minX + worldWidth / 2;
    const worldCenterY = minY + worldHeight / 2;

    const padding = 150;
    const newScale = Math.min(
      rect.width / (worldWidth + padding),
      rect.height / (worldHeight + padding),
      1.5
    );

    setViewport({
      x: rect.width / 2 - worldCenterX * newScale,
      y: rect.height / 2 - worldCenterY * newScale,
      scale: newScale
    });
  }, [components, traces, allPins]);

  const rotateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    saveToHistory();
    setComponents(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, rotation: (c.rotation + 90) % 360 } : c));
  }, [selectedIds, saveToHistory]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    saveToHistory();
    const selectedComps = components.filter(c => selectedIds.has(c.id));
    const junctionToMerge = selectedComps.find(c => c.footprintId === 'PIN');
    if (junctionToMerge && selectedIds.size === 1) {
      const connectedTraces = traces.filter(t => t.fromPinId.startsWith(junctionToMerge.id) || t.toPinId.startsWith(junctionToMerge.id));
      if (connectedTraces.length === 2) {
        const [t1, t2] = connectedTraces;
        const startPinId = t1.fromPinId.startsWith(junctionToMerge.id) ? t1.toPinId : t1.fromPinId;
        const endPinId = t2.fromPinId.startsWith(junctionToMerge.id) ? t2.toPinId : t2.fromPinId;
        const merged: Trace = { id: `trace_merged_${Date.now()}`, fromPinId: startPinId, toPinId: endPinId, width: Math.max(t1.width, t2.width), color: t1.color };
        setTraces(prev => [...prev.filter(t => t.id !== t1.id && t.id !== t2.id), merged]);
        setComponents(prev => prev.filter(c => c.id !== junctionToMerge.id));
        setSelectedIds(new Set([merged.id]));
        return;
      }
    }
    setComponents(prev => prev.filter(c => !selectedIds.has(c.id)));
    setTraces(prev => prev.filter(t => !selectedIds.has(t.id) && !selectedIds.has(allPins.find(p => p.id === t.fromPinId)?.componentId || '') && !selectedIds.has(allPins.find(p => p.id === t.toPinId)?.componentId || '')));
    setSelectedIds(new Set());
  }, [selectedIds, components, traces, saveToHistory, allPins]);

  const exportToSVGAction = useCallback(() => exportToSVG(), [components, traces, allPins]);
  const exportToGRBLAction = useCallback(() => console.log(exportToGRBL(components, traces, allPins)), [components, traces, allPins]);

  // --- Project Save/Load Logic ---
  const handleSaveProject = useCallback(() => {
    const projectData = {
      format: "CircuitFlow JSON",
      version: "1.0",
      components,
      traces,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `circuitflow_project_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [components, traces]);

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data && Array.isArray(data.components) && Array.isArray(data.traces)) {
          saveToHistory();
          setComponents(data.components);
          setTraces(data.traces);
          setSelectedIds(new Set());
          setInvalidTraceIds(new Set());
          setViolationMarkers([]);
          setLastCheckResult('none');
          // Optionally center view after load
          // centerView();
        } else {
          alert("Invalid project file format. Missing components or traces.");
        }
      } catch (err) {
        alert("Failed to parse project JSON. Ensure the file is a valid CircuitFlow project.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        rotateSelected();
      } else if (e.key.toLowerCase() === 'c' && !cmdOrCtrl) {
        e.preventDefault();
        centerView();
      } else if (e.key.toLowerCase() === 's' && !cmdOrCtrl) {
        e.preventDefault();
        setTool('select');
      } else if (e.key.toLowerCase() === 'h' && !cmdOrCtrl) {
        e.preventDefault();
        setTool('pan');
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoom(1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoom(-1);
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        exportToSVGAction();
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        exportToGRBLAction();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, deleteSelected, rotateSelected, handleZoom, exportToSVGAction, exportToGRBLAction, centerView]);

  const hoveredPin = useMemo(() => {
    const pin = allPins.find(p => p.id === hoveredPinId);
    if (!pin) return null;
    const comp = components.find(c => c.id === pin.componentId);
    if (comp?.footprintId === 'PIN') return null;
    return pin;
  }, [allPins, hoveredPinId, components]);

  const selectedItems = useMemo(() => {
    const comps = components.filter(c => selectedIds.has(c.id));
    const trcs = traces.filter(t => selectedIds.has(t.id));
    return { components: comps, traces: trcs };
  }, [components, traces, selectedIds]);

  // --- SVG Export Logic ---
  const exportToSVG = () => {
    if (components.length === 0 && traces.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    components.forEach(c => {
      if (c.footprintId === 'PIN') return;
      const f = getFootprint(c.footprintId);
      if (!f) return;
      minX = Math.min(minX, c.position.x); minY = Math.min(minY, c.position.y);
      maxX = Math.max(maxX, c.position.x + f.width); maxY = Math.max(maxY, c.position.y + f.height);
    });
    traces.forEach(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId);
      const p2 = allPins.find(p => p.id === t.toPinId);
      if (p1 && p2) {
        minX = Math.min(minX, p1.globalPos.x, p2.globalPos.x); minY = Math.min(minY, p1.globalPos.y, p2.globalPos.y);
        maxX = Math.max(maxX, p1.globalPos.x, p2.globalPos.x); maxY = Math.max(maxY, p1.globalPos.y, p2.globalPos.y);
      }
    });
    const padding = 100;
    const width = (maxX - minX || 500) + padding * 2;
    const height = (maxY - minY || 500) + padding * 2;
    const svgTraces = traces.map(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
      if (!p1 || !p2) return '';
      return `<path d="${generateBezierPath(p1.globalPos, p2.globalPos, t)}" stroke="${t.color}" stroke-width="${t.width}" fill="none" stroke-linecap="round" />`;
    }).join('\n');
    const svgComponents = components.map(c => {
      if (c.footprintId === 'PIN') return '';
      const foot = getFootprint(c.footprintId);
      if (!foot) return '';
      const silk = `<rect width="${foot.width}" height="${foot.height}" fill="none" stroke="#10b981" stroke-width="2" rx="4" />`;
      const nameTag = `<text x="${foot.width / 2}" y="-10" text-anchor="middle" fill="#888" font-family="monospace" font-size="12">${c.name}</text>`;
      const pinNodes = foot.pins.map(p => {
        const pos = getPinGlobalPos(c, p);
        const color = p.type === 'power' ? '#ef4444' : (p.type === 'ground' ? '#3b82f6' : '#FCD34D');
        return `<circle cx="${pos.x}" cy="${pos.y}" r="8" fill="#18181b" stroke="${color}" stroke-width="1.5" />`;
      }).join('\n');
      return `<g transform="translate(${c.position.x}, ${c.position.y}) rotate(${c.rotation}, ${foot.width/2}, ${foot.height/2})">${silk}${nameTag}</g><g>${pinNodes}</g>`;
    }).join('\n');
    const fullSVG = `<svg width="${width}" height="${height}" viewBox="${minX - padding} ${minY - padding} ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${minX - padding}" y="${minY - padding}" width="${width}" height="${height}" fill="#050C07" />${svgTraces}${svgComponents}</svg>`;
    const blob = new Blob([fullSVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `circuit_export_${Date.now()}.svg`; link.click();
    URL.revokeObjectURL(url);
  };

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
      return { id: t.id, from: t.fromPinId, to: t.toPinId, pts: Array.from({ length: 15 }, (_, i) => getPointOnBezier(i / 14, p1.globalPos, p2.globalPos, t)) };
    }).filter(d => d !== null);
    for (let i = 0; i < traceData.length; i++) {
      for (let j = i + 1; j < traceData.length; j++) {
        const a = traceData[i]!; const b = traceData[j]!;
        const connected = a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
        if (connected) continue;
        let pairCollisionFound = false;
        for (const pa of a.pts) {
          for (const pb of b.pts) {
            if (checkCollision(pa, pb, clearance)) {
              invalid.add(a.id); invalid.add(b.id);
              if (!pairCollisionFound && markers.length < 30) { markers.push({ x: (pa.x + pb.x)/2, y: (pa.y + pb.y)/2 }); pairCollisionFound = true; }
              break;
            }
          }
          if (pairCollisionFound) break;
        }
      }
    }
    components.forEach(c => {
      const foot = getFootprint(c.footprintId);
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
              if (!padCollisionFound && markers.length < 30) { markers.push(pt); padCollisionFound = true; }
              break;
            }
          }
        });
      });
    });
    setInvalidTraceIds(invalid); setViolationMarkers(markers);
    setLastCheckResult(invalid.size > 0 ? 'fail' : (traces.length > 0 ? 'pass' : 'none'));
    setTimeout(() => setIsDrcRunning(false), 200);
  }, [traces, allPins, components]);

  useEffect(() => {
    const timeout = setTimeout(runDRC, 800);
    return () => clearTimeout(timeout);
  }, [traces, components, runDRC]);

  const createJunctionAt = (world: Vector2): string => {
    const junctionPos = { x: snap(world.x, true) - 12.7, y: snap(world.y, true) - 12.7 };
    const junctionId = `comp_junc_${Date.now()}`;
    const newJunction: PCBComponent = {
      id: junctionId, footprintId: 'PIN', name: 'J' + (components.length + 1), position: junctionPos, rotation: 0
    };
    saveToHistory();
    setComponents(prev => [...prev, newJunction]);
    return `${junctionId}_p1`;
  };

  const getCompPosForPinTarget = (footprintId: string, targetPinWorld: Vector2, rotation: number) => {
    const foot = getFootprint(footprintId);
    if (!foot) return targetPinWorld;
    const firstPin = foot.pins[0];
    if (!firstPin) return targetPinWorld;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    const cx = foot.width / 2; const cy = foot.height / 2;
    const lx = firstPin.localPos.x - cx; const ly = firstPin.localPos.y - cy;
    const nx = lx * cos - ly * sin; const ny = lx * sin + ly * cos;
    return { x: targetPinWorld.x - (nx + cx), y: targetPinWorld.y - (ny + cy) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    const world = getScreenToWorld(e.clientX, e.clientY);

    // Sidebar placement
    if (pendingFootprintId) {
      const foot = getFootprint(pendingFootprintId);
      if (foot) {
        saveToHistory();
        const pos = getCompPosForPinTarget(pendingFootprintId, { x: snap(world.x), y: snap(world.y) }, 0);
        const id = `comp_${Date.now()}`;
        setComponents(prev => [...prev, {
          id, footprintId: pendingFootprintId, name: foot.name.split(' ')[0].substring(0,3).toUpperCase() + (components.length+1),
          position: pos, rotation: 0, value: foot.valueType === 'resistance' ? '10k' : (foot.valueType === 'capacitance' ? '100nF' : undefined)
        }]);
        setSelectedIds(new Set([id]));
        setPendingFootprintId(null); setPreviewPos(null);
      }
      return;
    }

    if (tool === 'pan' || e.button === 1) {
      dragRef.current = { type: 'pan', startWorld: { x: e.clientX, y: e.clientY } };
      return;
    }

    // Bezier handles
    for (const tId of selectedIds) {
      const trace = traces.find(t => t.id === tId);
      if (trace) {
        const p1 = allPins.find(p => p.id === trace.fromPinId);
        const p2 = allPins.find(p => p.id === trace.toPinId);
        if (p1 && p2) {
          const ctrl = getBezierControlPoints(p1.globalPos, p2.globalPos, trace);
          if (checkCollision(world, { x: ctrl.cx1, y: ctrl.cy1 }, 12)) {
            saveToHistory();
            dragRef.current = { type: 'handle', id: tId, handleIdx: 1, startWorld: world, offset: { x: world.x - ctrl.cx1, y: world.y - ctrl.cy1 } };
            return;
          }
          if (checkCollision(world, { x: ctrl.cx2, y: ctrl.cy2 }, 12)) {
            saveToHistory();
            dragRef.current = { type: 'handle', id: tId, handleIdx: 2, startWorld: world, offset: { x: world.x - ctrl.cx2, y: world.y - ctrl.cy2 } };
            return;
          }
        }
      }
    }

    // --- REFINED SELECTION LOGIC WITH CYCLE MECHANISM ---
    const hitPins = allPins.filter(p => checkCollision(p.globalPos, world, 14)).map(p => p.id);
    const hitComps = components.filter(c => {
      const f = getFootprint(c.footprintId);
      const isJunc = c.footprintId === 'PIN';
      if (isJunc) {
        const isConnectedTraceSelected = traces.some(t => selectedIds.has(t.id) && (t.fromPinId.startsWith(c.id) || t.toPinId.startsWith(c.id)));
        if (!selectedIds.has(c.id) && !isConnectedTraceSelected && hoveredCompId !== c.id) return false;
      }
      return f && world.x >= c.position.x && world.x <= c.position.x + f.width && world.y >= c.position.y && world.y <= c.position.y + f.height;
    }).map(c => c.id).reverse();

    const hitTraces = traces.filter(t => {
      const p1 = allPins.find(p => p.id === t.fromPinId);
      const p2 = allPins.find(p => p.id === t.toPinId);
      if(!p1 || !p2) return false;
      for(let i=0; i<=20; i++) {
        if(checkCollision(world, getPointOnBezier(i/20, p1.globalPos, p2.globalPos, t), 15)) return true;
      }
      return false;
    }).map(t => t.id).reverse();

    const allHits = [...hitPins, ...hitComps, ...hitTraces];

    if (allHits.length > 0) {
      let nextId = allHits[0];
      const isAnyInSelection = allHits.some(h => selectedIds.has(h));
      if (isAnyInSelection && !e.shiftKey) {
         const currentIndex = allHits.findIndex(h => selectedIds.has(h));
         nextId = allHits[(currentIndex + 1) % allHits.length];
      }

      // Special handling for pins
      const foundPin = allPins.find(p => p.id === nextId);
      if (foundPin) {
        const comp = components.find(c => c.id === foundPin.componentId);
        if (comp?.footprintId === 'PIN') {
          saveToHistory();
          setSelectedIds(new Set([comp.id]));
          dragRef.current = { type: 'move', id: comp.id, startWorld: world, offset: { x: world.x - foundPin.globalPos.x, y: world.y - foundPin.globalPos.y }, hasMoved: false };
        } else {
          dragRef.current = { type: 'route', id: foundPin.id, startWorld: world };
        }
        return;
      }

      if (e.shiftKey) {
        const next = new Set(selectedIds);
        if (next.has(nextId)) next.delete(nextId); else next.add(nextId);
        setSelectedIds(next);
      } else {
        setSelectedIds(new Set([nextId]));
      }

      if (hitComps.includes(nextId)) {
        saveToHistory();
        const p1 = allPins.find(p => p.componentId === nextId);
        dragRef.current = { type: 'move', id: nextId, startWorld: world, offset: p1 ? { x: world.x - p1.globalPos.x, y: world.y - p1.globalPos.y } : { x: 0, y: 0 }, hasMoved: false };
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
    
    const hitPin = allPins.find(p => {
       const comp = components.find(c => c.id === p.componentId);
       if (comp?.footprintId === 'PIN') {
         const isSelected = selectedIds.has(comp.id);
         const isParentTraceSelected = traces.some(t => selectedIds.has(t.id) && (t.fromPinId === p.id || t.toPinId === p.id));
         if (!isSelected && !isParentTraceSelected) return false;
       }
       return checkCollision(p.globalPos, world, 15);
    });
    setHoveredPinId(hitPin?.id || null);

    if (!drag) return;

    if (drag.type === 'pan') {
      const dx = e.clientX - drag.startWorld.x;
      const dy = e.clientY - drag.startWorld.y;
      setViewport(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      drag.startWorld = { x: e.clientX, y: e.clientY };
    } else if (drag.type === 'potential_split' && drag.id) {
      const dist = Math.hypot(world.x - drag.startWorld.x, world.y - drag.startWorld.y);
      if (dist > 10) {
        const hitTrace = traces.find(t => t.id === drag.id);
        if (hitTrace) {
          const junctionPinId = createJunctionAt(world);
          const newCompId = junctionPinId.split('_')[0];
          const seg1: Trace = { id: `trace_${Date.now()}_1`, fromPinId: hitTrace.fromPinId, toPinId: junctionPinId, width: hitTrace.width, color: hitTrace.color };
          const seg2: Trace = { id: `trace_${Date.now()}_2`, fromPinId: junctionPinId, toPinId: hitTrace.toPinId, width: hitTrace.width, color: hitTrace.color };
          setTraces(prev => [...prev.filter(t => t.id !== hitTrace.id), seg1, seg2]);
          setSelectedIds(new Set([newCompId]));
          dragRef.current = { type: 'move', id: newCompId, startWorld: world, offset: { x: 0, y: 0 }, hasMoved: true, initialComp: { id: newCompId, footprintId: 'PIN', rotation: 0 } as any };
        }
      }
    } else if (drag.type === 'move' && drag.id) {
      const comp = components.find(c => c.id === drag.id) || drag.initialComp;
      if (comp) {
        const isJunc = comp.footprintId === 'PIN';
        const snappedPinWorld = { x: snap(world.x - (drag.offset?.x || 0), isJunc), y: snap(world.y - (drag.offset?.y || 0), isJunc) };
        const newPos = getCompPosForPinTarget(comp.footprintId, snappedPinWorld, comp.rotation);
        if (Math.abs(newPos.x - (comp.position?.x || 0)) > 1 || Math.abs(newPos.y - (comp.position?.y || 0)) > 1) drag.hasMoved = true;
        setComponents(prev => prev.map(c => c.id === drag.id ? { ...c, position: newPos } : c));

        // Smooth joint maintenance for junctions AND components (if pin has exactly 2 traces)
        setTraces(prev => {
          const movingPins = allPins.filter(p => p.componentId === drag.id).map(p => p.id);
          const updated = [...prev];
          updated.forEach(t => {
            const isFromMoving = movingPins.includes(t.fromPinId);
            const isToMoving = movingPins.includes(t.toPinId);
            if (isFromMoving || isToMoving) {
              const movingNodeId = isFromMoving ? t.fromPinId : t.toPinId;
              const connectedTraces = updated.filter(a => a.fromPinId === movingNodeId || a.toPinId === movingNodeId);
              if (connectedTraces.length === 2) {
                const currentH = isFromMoving ? (t.c1Offset || {x:0,y:0}) : (t.c2Offset || {x:0,y:0});
                const mirrored = { x: -currentH.x, y: -currentH.y };
                const other = connectedTraces.find(a => a.id !== t.id);
                if (other) {
                   if (other.fromPinId === movingNodeId) other.c1Offset = mirrored; else other.c2Offset = mirrored;
                }
              }
            }
          });
          return updated;
        });
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
          const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
          if (!p1 || !p2) return t;
          return drag.handleIdx === 1 ? { ...t, c1Offset: { x: targetPos.x - p1.globalPos.x, y: targetPos.y - p1.globalPos.y } } : { ...t, c2Offset: { x: targetPos.x - p2.globalPos.x, y: targetPos.y - p2.globalPos.y } };
        });
        const movedTrace = newTraces.find(t => t.id === drag.id);
        if (movedTrace) {
          const pinId = drag.handleIdx === 1 ? movedTrace.fromPinId : movedTrace.toPinId;
          const connectedTraces = newTraces.filter(a => a.fromPinId === pinId || a.toPinId === pinId);
          if (connectedTraces.length === 2) {
             const movingOffset = drag.handleIdx === 1 ? movedTrace.c1Offset! : movedTrace.c2Offset!;
             const oppositeOffset = { x: -movingOffset.x, y: -movingOffset.y };
             const adjacent = connectedTraces.find(a => a.id !== movedTrace.id);
             if (adjacent) {
                if (adjacent.fromPinId === pinId) adjacent.c1Offset = oppositeOffset; else adjacent.c2Offset = oppositeOffset;
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
        const f = getFootprint(c.footprintId);
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
        saveToHistory();
        setTraces(prev => [...prev, { id: `trace_${Date.now()}`, fromPinId: drag.id!, toPinId: endPin.id, width: 8, color: '#FCD34D' }]);
      } else {
        const hitTrace = [...traces].reverse().find(t => {
          const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId);
          if(!p1 || !p2) return false;
          for(let i=0; i<=20; i++) {
            if(checkCollision(world, getPointOnBezier(i/20, p1.globalPos, p2.globalPos, t), 25)) return true;
          }
          return false;
        });
        if (hitTrace) {
          const junctionPinId = createJunctionAt(world);
          setTraces(prev => [...prev, { id: `trace_${Date.now()}`, fromPinId: drag.id!, toPinId: junctionPinId, width: 8, color: '#FCD34D' }]);
        }
      }
    }
    dragRef.current = null; setRoutingPreview(null); setMarquee(null); setHoveredPinId(null);
  };

  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); handleZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); };

  const removeFromSelection = (id: string) => { setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; }); };
  
  const updateTraceWidth = (id: string, width: number) => { 
    saveToHistory();
    setTraces(prev => prev.map(t => t.id === id ? { ...t, width } : t)); 
  };
  
  const updateComponentProps = (id: string, updates: Partial<PCBComponent>) => { 
    saveToHistory();
    setComponents(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c)); 
  };

  const handleLibraryClick = (fId: string) => {
    if (fId === 'dip') {
      setModalMode('ic');
    } else if (fId === 'header') {
      setModalMode('header');
    } else {
      setPendingFootprintId(fId);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#050C07] text-zinc-200 overflow-hidden font-sans select-none">
      {/* Hidden file input for project loading */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleLoadProject} 
        className="hidden" 
        accept=".json"
      />

      {/* Component Selection Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="bg-[#0A1A0F] border border-[#1A4A23] rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-2xl">
                  {modalMode === 'ic' ? <Hash className="text-emerald-500" size={24} /> : <SlidersHorizontal className="text-emerald-500" size={24} />}
                </div>
                <h2 className="text-xl font-black italic tracking-tight text-white uppercase">
                  {modalMode === 'ic' ? 'IC PIN COUNT' : 'HEADER SIZE'}
                </h2>
              </div>
              <button onClick={() => setModalMode(null)} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors"><X size={24} /></button>
            </div>

            {modalMode === 'ic' ? (
              <>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">Select number of pins for DIP package</p>
                <div className="grid grid-cols-4 gap-3">
                  {[6, 8, 14, 16, 18, 20, 24, 28].map(count => (
                    <button
                      key={count}
                      onClick={() => {
                        setPendingFootprintId(`dip_${count}`);
                        setModalMode(null);
                      }}
                      className="py-4 bg-zinc-950 border border-zinc-800 hover:border-emerald-500 hover:bg-emerald-500/10 rounded-2xl transition-all font-black text-lg text-white hover:text-emerald-500"
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-8">
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Adjust number of pins (1 - 20)</p>
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-emerald-900 uppercase">PIN COUNT</span>
                    <span className="text-4xl font-black text-white italic">{headerPinCount}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="20" 
                    step="1" 
                    value={headerPinCount}
                    onChange={(e) => setHeaderPinCount(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 bg-zinc-950 h-3 rounded-full appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-black text-emerald-900">
                    <span>1 PIN</span>
                    <span>20 PINS</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPendingFootprintId(`header_${headerPinCount}`);
                    setModalMode(null);
                  }}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  <Plus size={18} /> Place {headerPinCount}-Pin Header
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-72 bg-[#0A1A0F] border-r border-[#1A4A23] flex flex-col p-4 gap-6 z-10 shadow-2xl overflow-y-auto scrollbar-thin">
        <div className="flex items-center gap-3 px-2">
          <div className="bg-emerald-500/10 p-2 rounded-lg"><CircuitBoard className="text-emerald-500" size={24} /></div>
          <h1 className="font-bold text-xl tracking-tight bg-gradient-to-br from-white to-emerald-800 bg-clip-text text-transparent italic">CircuitFlow</h1>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-[10px] font-black text-emerald-900 uppercase tracking-widest px-2 flex items-center gap-2"><Layers size={12} /> LIBRARY</label>
          <div className="grid grid-cols-1 gap-2">
            {FOOTPRINTS.filter(f => f.id !== 'PIN').map(f => (
              <button key={f.id} onClick={() => handleLibraryClick(f.id)} className={`flex items-center gap-3 p-3 rounded-xl transition-all text-xs font-bold border ${pendingFootprintId === f.id ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg shadow-emerald-500/20' : 'bg-zinc-950 hover:bg-[#152B1B] border-zinc-800 hover:border-emerald-900/50'}`}>
                <div className="p-1 bg-zinc-900/50 rounded-md shrink-0">{f.id === 'pin' ? <Circle size={14} /> : <Plus size={14} />}</div>
                {f.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-4 border-t border-[#1A4A23] pt-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-2 mb-1"><span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">DRC STATUS</span><button onClick={() => runDRC()} className="hover:bg-zinc-800 p-1.5 rounded-lg text-zinc-500 hover:text-emerald-500 transition-colors"><RefreshCw size={14} className={isDrcRunning ? "animate-spin" : ""} /></button></div>
            <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${lastCheckResult === 'fail' ? 'bg-red-500/10 border-red-500/50 text-red-400' : lastCheckResult === 'pass' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
              <div className="shrink-0">{lastCheckResult === 'fail' ? <AlertTriangle size={24} /> : lastCheckResult === 'pass' ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}</div>
              <span className="text-xs font-black tracking-widest uppercase">{isDrcRunning ? 'Analyzing...' : lastCheckResult === 'fail' ? `${invalidTraceIds.size} Faults` : lastCheckResult === 'pass' ? 'Clear' : 'Idle'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button title="Export SVG (Ctrl+E)" onClick={exportToSVGAction} className="group relative flex flex-col items-center justify-center gap-1 p-3 bg-[#0D2315] hover:bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-900/50 transition-all font-black text-[10px] uppercase">
              <FileCode size={18} /> SVG
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 uppercase">Ctrl + E</span>
            </button>
            <button title="Export GRBL (Ctrl+G)" onClick={exportToGRBLAction} className="group relative flex flex-col items-center justify-center gap-1 p-3 bg-zinc-900/50 hover:bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-900/50 transition-all font-black text-[10px] uppercase">
              <Download size={18} /> GRBL
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 uppercase">Ctrl + G</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#1A4A23]/30">
            <button 
              title="Save JSON Project" 
              onClick={handleSaveProject} 
              className="flex flex-col items-center justify-center gap-1 p-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all font-black text-[10px] uppercase shadow-lg shadow-emerald-500/10"
            >
              <Save size={18} /> Save
            </button>
            <button 
              title="Load JSON Project" 
              onClick={() => fileInputRef.current?.click()} 
              className="flex flex-col items-center justify-center gap-1 p-3 bg-zinc-100 hover:bg-white text-black rounded-xl transition-all font-black text-[10px] uppercase shadow-lg shadow-white/10"
            >
              <Upload size={18} /> Load
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#050C07]">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-[#0A1A0F]/90 backdrop-blur-md border border-[#1A4A23] rounded-2xl shadow-2xl z-20">
          <button title="Select Tool (S)" onClick={() => setTool('select')} className={`group relative p-3 rounded-xl transition-all ${tool === 'select' ? 'bg-emerald-500 text-black' : 'hover:bg-[#152B1B] text-emerald-900'}`}>
            <MousePointer2 size={20} />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">S</span>
          </button>
          <button title="Pan Tool (H)" onClick={() => setTool('pan')} className={`group relative p-3 rounded-xl transition-all ${tool === 'pan' ? 'bg-emerald-500 text-black' : 'hover:bg-[#152B1B] text-emerald-900'}`}>
            <Hand size={20} />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">H</span>
          </button>
          <div className="w-px h-6 bg-zinc-800 mx-1" />
          <button title="Undo (Ctrl+Z)" onClick={undo} className={`group relative p-3 rounded-xl hover:bg-[#152B1B] text-emerald-500 disabled:opacity-20`} disabled={history.length === 0}>
            <Undo2 size={20} />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Ctrl + Z</span>
          </button>
          <button title="Center View (C)" onClick={centerView} className="group relative p-3 rounded-xl hover:bg-[#152B1B] text-emerald-500">
            <Target size={20} />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">C</span>
          </button>
          <button title="Rotate (R)" onClick={rotateSelected} className="group relative p-3 rounded-xl hover:bg-[#152B1B] text-emerald-500 disabled:opacity-30" disabled={selectedIds.size === 0}>
            <RotateCw size={20} />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">R</span>
          </button>
          <button title="Delete (Del)" onClick={deleteSelected} className="group relative p-3 rounded-xl hover:bg-red-500/20 hover:text-red-400 text-emerald-500 disabled:opacity-30" disabled={selectedIds.size === 0}>
            <Trash2 size={20} />
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Del</span>
          </button>
          <div className="w-px h-6 bg-zinc-800 mx-1" />
          <div className="flex items-center gap-1 bg-zinc-950/50 rounded-xl px-2">
            <button title="Zoom In (+)" className="group relative p-2 hover:bg-zinc-800 text-zinc-400" onClick={() => handleZoom(1)}>
              <ZoomIn size={16} />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">+</span>
            </button>
            <span className="text-[10px] font-mono text-zinc-600 w-12 text-center">{Math.round(viewport.scale * 100)}%</span>
            <button title="Zoom Out (-)" className="group relative p-2 hover:bg-zinc-800 text-zinc-400" onClick={() => handleZoom(-1)}>
              <ZoomOut size={16} />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-2 py-1 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">-</span>
            </button>
          </div>
        </div>

        <svg ref={boardRef} className="w-full h-full cursor-crosshair touch-none outline-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
          <g ref={viewportRef} transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
            <pattern id="grid" width={SNAP_SIZE} height={SNAP_SIZE} patternTransform="translate(-1 -1)" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.2" fill="#152B1B" /></pattern>
            <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />

            {components.map(c => {
              const foot = getFootprint(c.footprintId); if (!foot) return null;
              const isSelected = selectedIds.has(c.id); const isHighlighted = hoveredCompId === c.id;
              const isJunction = foot.id === 'PIN';
              const isParentTraceSelected = isJunction && traces.some(t => selectedIds.has(t.id) && (t.fromPinId.startsWith(c.id) || t.toPinId.startsWith(c.id)));
              
              if (isJunction && !isSelected && !isParentTraceSelected && !isHighlighted) return null;

              return (
                <g key={c.id} transform={`translate(${c.position.x}, ${c.position.y}) rotate(${c.rotation}, ${foot.width/2}, ${foot.height/2})`} className="transition-all duration-75">
                  {!isJunction && <rect width={foot.width} height={foot.height} fill={isSelected ? '#10b98108' : 'transparent'} stroke={isHighlighted ? '#10b981' : (isSelected ? '#10b98180' : '#27272a')} strokeWidth={isHighlighted ? "4" : "1.5"} rx="4" className="transition-all" />}
                  {!isJunction && <text x={foot.width / 2} y={-10} textAnchor="middle" fill={isHighlighted ? "#10b981" : "#3f3f46"} className="text-[10px] font-bold font-mono pointer-events-none transition-colors" dy=".3em">{c.name}</text>}
                  {foot.pins.map(pin => {
                    const pColor = pin.type === 'power' ? '#ef4444' : (pin.type === 'ground' ? '#3b82f6' : '#FCD34D');
                    return (
                      <g key={pin.id}>
                        <circle cx={pin.localPos.x} cy={pin.localPos.y} r={11} fill="#18181b" stroke={pColor} strokeWidth="3" className="transition-all shadow-2xl" />
                        <circle cx={pin.localPos.x} cy={pin.localPos.y} r="3.5" fill={pColor} className="opacity-80" />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {traces.map(t => {
              const p1 = allPins.find(p => p.id === t.fromPinId), p2 = allPins.find(p => p.id === t.toPinId); if (!p1 || !p2) return null;
              const isSelected = selectedIds.has(t.id), isInvalid = invalidTraceIds.has(t.id), isHighlighted = hoveredCompId === t.id;
              const path = generateBezierPath(p1.globalPos, p2.globalPos, t);
              return (
                <g key={t.id}>
                  <path d={path} stroke="transparent" strokeWidth={t.width + 15} fill="none" strokeLinecap="round" className="cursor-pointer" />
                  <path d={path} stroke={isInvalid ? '#ef4444' : (isHighlighted ? '#FCD34D' : (isSelected ? '#FCD34D' : '#FCD34D80'))} strokeWidth={isHighlighted ? t.width + 4 : t.width} fill="none" strokeLinecap="round" className="transition-all pointer-events-none shadow-xl" style={{ filter: isSelected || isHighlighted ? 'drop-shadow(0 0 6px #FCD34D50)' : 'none' }} />
                  {isSelected && (
                    <g className="pointer-events-none">
                      {(() => {
                        const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(p1.globalPos, p2.globalPos, t);
                        return (
                          <>
                            <line x1={p1.globalPos.x} y1={p1.globalPos.y} x2={cx1} y2={cy1} stroke="#FCD34D" strokeWidth="0.7" strokeDasharray="3 3" />
                            <line x1={p2.globalPos.x} y1={p2.globalPos.y} x2={cx2} y2={cy2} stroke="#FCD34D" strokeWidth="0.7" strokeDasharray="3 3" />
                            <circle cx={cx1} cy={cy1} r="7" fill="#FCD34D" className="pointer-events-auto cursor-move" />
                            <circle cx={cx2} cy={cy2} r="7" fill="#FCD34D" className="pointer-events-auto cursor-move" />
                          </>
                        );
                      })()}
                    </g>
                  )}
                </g>
              );
            })}

            {routingPreview && <path d={routingPreview.path} stroke="#FCD34D" strokeWidth="4" fill="none" strokeDasharray="5 5" className="pointer-events-none opacity-60" />}
            {violationMarkers.map((m, i) => (
              <g key={i} transform={`translate(${m.x}, ${m.y})`}><circle r="20" fill="#ef444425" className="animate-pulse" /><path d="M 0 -13 L 13 10 L -13 10 Z" fill="#ef4444" stroke="#050C07" strokeWidth="1.5" strokeLinejoin="round" /><text x="0" y="7" textAnchor="middle" fill="#fff" className="text-[10px] font-black pointer-events-none">!</text></g>
            ))}

            {hoveredPin && !marquee && !pendingFootprintId && (
              <g transform={`translate(${hoveredPin.globalPos.x + 15}, ${hoveredPin.globalPos.y - 15})`} className="pointer-events-none drop-shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1">
                <rect x="0" y="0" width={Math.max(80, hoveredPin.name.length * 8 + 40)} height="38" rx="8" fill="#0A1A0F" stroke="#1A4A23" strokeWidth="1.5" />
                <text x="10" y="18" fill="#FCD34D" className="text-[12px] font-mono font-bold">{hoveredPin.name}</text>
                <text x="10" y="30" fill="#3f3f46" className="text-[9px] font-mono uppercase tracking-widest">{hoveredPin.type}</text>
              </g>
            )}

            {pendingFootprintId && previewPos && (
              (() => {
                const foot = getFootprint(pendingFootprintId); if (!foot) return null;
                const tx = snap(previewPos.x), ty = snap(previewPos.y);
                const compPos = getCompPosForPinTarget(pendingFootprintId, {x: tx, y: ty}, 0);
                return (<g transform={`translate(${compPos.x}, ${compPos.y})`}><rect width={foot.width} height={foot.height} fill="#10b98108" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" className="pointer-events-none" /></g>);
              })()
            )}
            {marquee && <rect x={Math.min(marquee.start.x, marquee.end.x)} y={Math.min(marquee.start.y, marquee.end.y)} width={Math.abs(marquee.end.x - marquee.start.x)} height={Math.abs(marquee.end.y - marquee.start.y)} fill="#10b98108" stroke="#10b981" strokeWidth="1" strokeDasharray="5 3" className="pointer-events-none" />}
          </g>
        </svg>

        <div className="absolute top-24 left-6 flex flex-col gap-2 pointer-events-none">
          {selectedIds.size > 0 && (
            <div className="bg-[#0A1A0F]/90 backdrop-blur-md px-4 py-2 rounded-xl border border-[#1A4A23] shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
              <MousePointerSquareDashed size={14} className="text-emerald-500" /><span className="text-[10px] font-black uppercase tracking-widest">{selectedIds.size} Items Selected</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-80 bg-[#0A1A0F] border-l border-[#1A4A23] flex flex-col p-4 gap-6 z-10 shadow-2xl overflow-y-auto scrollbar-thin">
        <div className="flex items-center gap-3 px-2"><Settings2 size={16} className="text-emerald-900" /><h2 className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">Inspector</h2></div>
        {selectedIds.size > 1 ? (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-2">
            <div className="flex items-center justify-between px-2"><div className="flex items-center gap-2"><Layers size={14} className="text-emerald-500" /><h3 className="text-xs font-black uppercase tracking-widest">Selection Stack</h3></div><button onClick={() => setSelectedIds(new Set())} className="text-[10px] font-black text-emerald-900 hover:text-red-400 transition-colors uppercase">Clear</button></div>
            <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
              {[...selectedItems.components, ...selectedItems.traces].map(item => {
                const isComp = 'footprintId' in item; const name = isComp ? (item as PCBComponent).name : `Trace ${item.id.slice(-4)}`;
                return (
                  <div key={item.id} onMouseEnter={() => setHoveredCompId(item.id)} onMouseLeave={() => setHoveredCompId(null)} className={`group flex items-center justify-between bg-zinc-950 border ${hoveredCompId === item.id ? 'border-emerald-500' : 'border-zinc-800'} p-3 rounded-xl hover:border-emerald-500/50 transition-all cursor-pointer`} onClick={() => setSelectedIds(new Set([item.id]))}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-1.5 bg-zinc-900 rounded-lg group-hover:bg-emerald-500/20 transition-colors">{isComp ? <Plus size={14} className="text-emerald-500" /> : <Activity size={14} className="text-[#FCD34D]" />}</div>
                      <span className="text-[11px] font-bold truncate tracking-tight">{name}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeFromSelection(item.id); }} className="p-1.5 text-zinc-700 hover:text-red-400 transition-colors"><X size={16} /></button>
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] font-black text-emerald-900/40 text-center uppercase tracking-widest">Click item to isolate properties</p>
          </div>
        ) : selectedItems.traces.length === 1 ? (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-2">
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl">
              <div className="flex items-center gap-2 mb-6"><Activity size={18} className="text-[#FCD34D]" /><h3 className="text-xs font-black tracking-widest uppercase">Trace Properties</h3></div>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center"><label className="text-[10px] text-emerald-900 font-black uppercase tracking-widest">Track Width</label><span className="text-[10px] font-mono text-emerald-500">{selectedItems.traces[0].width} MIL</span></div>
                  <input type="range" min="1" max="50" step="1" value={selectedItems.traces[0].width} onChange={(e) => updateTraceWidth(selectedItems.traces[0].id, parseInt(e.target.value))} className="w-full accent-emerald-500 bg-[#050C07] h-2 rounded-full appearance-none cursor-pointer" />
                </div>
                <hr className="border-zinc-800" />
                <button title="Delete (Del)" onClick={deleteSelected} className="w-full flex items-center justify-center gap-2 p-4 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all text-[11px] font-black uppercase tracking-widest"><Trash2 size={16} /> Delete Path</button>
              </div>
            </div>
          </div>
        ) : selectedItems.components.length === 1 ? (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-2">
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl">
              <div className="flex items-center gap-2 mb-6"><Layers size={18} className="text-emerald-500" /><h3 className="text-xs font-black tracking-widest uppercase">{selectedItems.components[0].footprintId === 'PIN' ? 'Junction' : 'Properties'}</h3></div>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-emerald-900 font-black uppercase tracking-widest">Designator</label>
                  <input type="text" value={selectedItems.components[0].name} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { name: e.target.value })} className="w-full bg-[#050C07] border border-zinc-800 p-3.5 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono" />
                </div>
                {(() => {
                  const foot = getFootprint(selectedItems.components[0].footprintId);
                  if (!foot || !foot.valueType) return null;
                  return (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-emerald-900 font-black uppercase tracking-widest">{foot.valueType === 'resistance' ? 'Resistance' : 'Capacitance'}</label>
                      <div className="relative"><input type="text" value={selectedItems.components[0].value || ''} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { value: e.target.value })} className="w-full bg-[#050C07] border border-zinc-800 p-3.5 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono pl-11" /><Zap size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/40" /></div>
                    </div>
                  );
                })()}
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-emerald-900 font-black uppercase tracking-widest">Position</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative"><input type="number" value={Math.round(selectedItems.components[0].position.x)} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { position: { ...selectedItems.components[0].position, x: parseFloat(e.target.value) || 0 } })} className="w-full bg-[#050C07] border border-zinc-800 p-3.5 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono pl-9" /><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-900 font-black text-[11px]">X</span></div>
                    <div className="relative"><input type="number" value={Math.round(selectedItems.components[0].position.y)} onChange={(e) => updateComponentProps(selectedItems.components[0].id, { position: { ...selectedItems.components[0].position, y: parseFloat(e.target.value) || 0 } })} className="w-full bg-[#050C07] border border-zinc-800 p-3.5 rounded-xl text-sm focus:border-emerald-500 outline-none transition-all font-mono pl-9" /><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-900 font-black text-[11px]">Y</span></div>
                  </div>
                </div>
                {selectedItems.components[0].footprintId !== 'PIN' && (
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] text-emerald-900 font-black uppercase tracking-widest">Rotation</label>
                    <div className="grid grid-cols-4 gap-1.5">{[0, 90, 180, 270].map(angle => (<button key={angle} onClick={() => updateComponentProps(selectedItems.components[0].id, { rotation: angle })} className={`py-3 rounded-xl border transition-all text-[11px] font-black ${selectedItems.components[0].rotation === angle ? 'bg-emerald-500 border-emerald-400 text-black shadow-xl shadow-emerald-500/10' : 'bg-[#050C07] border-zinc-800 hover:border-emerald-900'}`}>{angle}°</button>))}</div>
                  </div>
                )}
                <hr className="border-zinc-800 mt-2" />
                <button title="Delete (Del)" onClick={deleteSelected} className="w-full flex items-center justify-center gap-2 p-4 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all text-[11px] font-black uppercase tracking-widest"><Trash2 size={18} /> Remove Item</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-800/50">
            <div className="bg-[#050C07] p-5 rounded-full mb-6 shadow-2xl border border-[#1A4A23]"><Eye size={36} className="text-emerald-900" /></div>
            <p className="text-[11px] font-black text-emerald-900/60 text-center uppercase tracking-widest leading-relaxed">Select items on the board to inspect properties</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
