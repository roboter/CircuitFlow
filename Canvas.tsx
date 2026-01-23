import React from 'react';
import { PCBComponent, Trace, Vector2, Pin } from './types';
import { SNAP_SIZE } from './constants';
import { generateBezierPath, getBezierControlPoints } from './utils/pcbUtils';

interface CanvasProps {
  boardRef: React.RefObject<SVGSVGElement>;
  viewportRef: React.RefObject<SVGGElement>;
  components: PCBComponent[];
  traces: Trace[];
  allPins: Pin[];
  selectedIds: Set<string>;
  hoveredPinId: string | null;
  hoveredCompId: string | null;
  viewport: { x: number; y: number; scale: number };
  routingPreview: { path: string } | null;
  marquee: { start: Vector2; end: Vector2 } | null;
  violationMarkers: Vector2[];
  pendingFootprintId: string | null;
  previewPos: Vector2 | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onTraceDoubleClick: (id: string) => void;
  onWheel: (e: React.WheelEvent) => void;
  getFootprint: (id: string) => any;
  getCompPosForPinTarget: (fid: string, target: Vector2, rot: number) => Vector2;
}

const Canvas: React.FC<CanvasProps> = ({
  boardRef, viewportRef, components, traces, allPins, selectedIds,
  hoveredPinId, hoveredCompId, viewport, routingPreview, marquee,
  violationMarkers, pendingFootprintId, previewPos,
  onPointerDown, onPointerMove, onPointerUp, onTraceDoubleClick, onWheel,
  getFootprint, getCompPosForPinTarget
}) => {
  const hoveredPin = allPins.find(p => p.id === hoveredPinId);
  const hoveredPinComp = hoveredPin ? components.find(c => c.id === hoveredPin.componentId) : null;
  const showTooltip = hoveredPin && hoveredPinComp?.footprintId !== 'JUNCTION';

  return (
    <svg 
      ref={boardRef} 
      className="w-full h-full cursor-crosshair touch-none outline-none" 
      onPointerDown={onPointerDown} 
      onPointerMove={onPointerMove} 
      onPointerUp={onPointerUp} 
      onWheel={onWheel}
    >
      <g ref={viewportRef} transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
        <pattern id="grid" width={SNAP_SIZE} height={SNAP_SIZE} patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1.2" fill="#152B1B" />
        </pattern>
        <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />

        {components.map(c => {
          const foot = getFootprint(c.footprintId);
          if (!foot) return null;
          const isJ = foot.id === 'JUNCTION';
          const isS = selectedIds.has(c.id);
          const isH = hoveredCompId === c.id;
          
          if (isJ && !isS && !traces.some(t => selectedIds.has(t.id) && (t.fromPinId.startsWith(c.id) || t.toPinId.startsWith(c.id))) && !isH) return null;

          const cx = foot.width / 2;
          const cy = foot.height / 2;

          return (
            <g key={c.id} transform={`translate(${c.position.x}, ${c.position.y}) rotate(${c.rotation}, ${cx}, ${cy})`}>
              {!isJ && (
                <>
                  {foot.shape === 'circle' ? (
                    <>
                      <circle cx={cx} cy={cy} r={Math.max(foot.width, foot.height) / 2} fill={isS ? '#10b98110' : 'transparent'} stroke={isS || isH ? '#10B981' : '#27272a'} strokeWidth={isS || isH ? "3" : "1.5"} />
                      {foot.id === 'led' && (
                        <path 
                          d={`M ${cx + 18} ${cy - 12} L ${cx + 18} ${cy + 12}`} 
                          stroke={isS || isH ? '#10B981' : '#27272a'} 
                          strokeWidth="2"
                        />
                      )}
                    </>
                  ) : (
                    <rect width={foot.width} height={foot.height} fill={isS ? '#10b98110' : 'transparent'} stroke={isS || isH ? '#10B981' : '#27272a'} strokeWidth={isS || isH ? "3" : "1.5"} rx="4" />
                  )}
                </>
              )}
              {foot.pins.map(pin => (
                <g key={pin.id} transform={`translate(${pin.localPos.x}, ${pin.localPos.y})`}>
                  <circle r="8" fill="#18181b" stroke="#065F46" strokeWidth="2" />
                  <circle r="2.5" fill={pin.type === 'power' ? '#ef4444' : (pin.type === 'ground' ? '#3b82f6' : '#FCD34D')} />
                  {pin.decoration === 'plus' && (
                    <g transform="translate(0, -12)">
                      <path d="M -3 0 L 3 0 M 0 -3 L 0 3" stroke="#FCD34D" strokeWidth="1.5" />
                    </g>
                  )}
                </g>
              ))}
              {!isJ && <text x={cx} y={-10} textAnchor="middle" fill={isS || isH ? "#10B981" : "#3f3f46"} className="text-[10px] font-bold font-mono pointer-events-none uppercase tracking-widest">{c.name}</text>}
              {c.locked && !isJ && (
                <g transform={`translate(${cx}, ${cy}) scale(1.8)`} opacity="0.15" pointerEvents="none">
                   <rect x="-15" y="-15" width="30" height="30" rx="8" fill="#ef4444" />
                   <path d="M-6 -4 L-6 -8 C-6 -11 -4 -13 0 -13 C4 -13 6 -11 6 -8 L6 -4" stroke="white" strokeWidth="3" fill="none" />
                </g>
              )}
            </g>
          );
        })}

        {traces.map(t => {
          const p1 = allPins.find(p => p.id === t.fromPinId);
          const p2 = allPins.find(p => p.id === t.toPinId);
          if(!p1 || !p2) return null;
          
          const fromJunc = components.find(c => c.id === p1.componentId && c.footprintId === 'JUNCTION');
          const toJunc = components.find(c => c.id === p2.componentId && c.footprintId === 'JUNCTION');
          
          const isS = selectedIds.has(t.id);
          const isJSelected = (fromJunc && selectedIds.has(fromJunc.id)) || (toJunc && selectedIds.has(toJunc.id));
          const showHandles = isS || isJSelected;

          const path = generateBezierPath(p1.globalPos!, p2.globalPos!, t);
          return (
            <g key={t.id} onDoubleClick={(e) => { e.stopPropagation(); onTraceDoubleClick(t.id); }} className="cursor-pointer">
              {/* Hit area path */}
              <path d={path} stroke="transparent" strokeWidth={t.width + 12} fill="none" pointerEvents="stroke" />
              {/* Visible trace */}
              <path d={path} stroke={isS ? t.color : t.color + '80'} strokeWidth={isS ? t.width + 4 : t.width} fill="none" strokeLinecap="round" pointerEvents="none" />
              {showHandles && (
                <g pointerEvents="all">
                  {(() => {
                    const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(p1.globalPos!, p2.globalPos!, t);
                    const showC1 = isS || (fromJunc && selectedIds.has(fromJunc.id));
                    const showC2 = isS || (toJunc && selectedIds.has(toJunc.id));

                    return (
                      <>
                        {showC1 && (
                          <>
                            <line x1={p1.globalPos!.x} y1={p1.globalPos!.y} x2={cx1} y2={cy1} stroke={t.color} strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
                            <circle cx={cx1} cy={cy1} r="5" fill={t.color} stroke="#000" strokeWidth="1" className="cursor-move shadow-lg" />
                          </>
                        )}
                        {showC2 && (
                          <>
                            <line x1={p2.globalPos!.x} y1={p2.globalPos!.y} x2={cx2} y2={cy2} stroke={t.color} strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
                            <circle cx={cx2} cy={cy2} r="5" fill={t.color} stroke="#000" strokeWidth="1" className="cursor-move shadow-lg" />
                          </>
                        )}
                      </>
                    );
                  })()}
                </g>
              )}
            </g>
          );
        })}

        {hoveredPin && (
          <g transform={`translate(${hoveredPin.globalPos!.x}, ${hoveredPin.globalPos!.y})`} className="pointer-events-none">
             <circle r="14" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 2" className="animate-spin-slow" />
            {showTooltip && (
              <g transform="translate(0, -22)">
                 <rect x="-45" y="-35" width="90" height="32" rx="6" fill="#0A1A0F" stroke="#10B981" strokeWidth="1.5" className="shadow-2xl" />
                 <text textAnchor="middle" y="-20" fill="#fff" className="text-[10px] font-black uppercase tracking-tighter mono">{hoveredPin.name}</text>
                 <text textAnchor="middle" y="-8" fill="#10B981" className="text-[8px] font-bold uppercase tracking-widest opacity-80">{hoveredPinComp?.name || 'NODE'}</text>
              </g>
            )}
          </g>
        )}

        {routingPreview && <path d={routingPreview.path} stroke="#3b82f6" strokeWidth="6" fill="none" strokeDasharray="8 4" className="opacity-50" />}
        
        {violationMarkers.map((m, i) => (
          <g key={i} transform={`translate(${m.x}, ${m.y})`}>
            <circle r="20" fill="#ef444425" className="animate-pulse" />
            <path d="M 0 -13 L 13 10 L -13 10 Z" fill="#ef4444" stroke="#050C07" strokeWidth="1.5" strokeLinejoin="round" />
            <text x="0" y="7" textAnchor="middle" fill="#fff" className="text-[10px] font-black pointer-events-none">!</text>
          </g>
        ))}

        {pendingFootprintId && previewPos && (
          (() => {
            const foot = getFootprint(pendingFootprintId);
            if (!foot) return null;
            const compPos = getCompPosForPinTarget(pendingFootprintId, {x: Math.round(previewPos.x/25.4)*25.4, y: Math.round(previewPos.y/25.4)*25.4}, 0);
            return (<g transform={`translate(${compPos.x}, ${compPos.y})`}><rect width={foot.width} height={foot.height} fill="#10b98108" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" className="pointer-events-none" /></g>);
          })()
        )}
        {marquee && <rect x={Math.min(marquee.start.x, marquee.end.x)} y={Math.min(marquee.start.y, marquee.end.y)} width={Math.abs(marquee.end.x - marquee.start.x)} height={Math.abs(marquee.end.y - marquee.start.y)} fill="#10b98108" stroke="#10b981" strokeWidth="1" strokeDasharray="5 3" className="pointer-events-none" />}
      </g>
      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; transform-origin: center; transform-box: fill-box; }
      `}</style>
    </svg>
  );
};

export default Canvas;