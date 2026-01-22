import { PCBComponent, Trace, Pin } from '../types';
import { getPinGlobalPos, getBezierControlPoints } from './pcbUtils';
import { getFootprint } from '../constants';

export const exportToGRBL = (
  components: PCBComponent[],
  traces: Trace[],
  allPins: Pin[]
): string => {
  const lines: string[] = [
    '(CircuitFlow GRBL Export)',
    'G21 (Units: Metric)',
    'G90 (Absolute Positioning)',
    'G0 Z5 (Lift Tool)',
    'M3 S1000 (Spindle On)',
    'G4 P1 (Wait 1s)',
    ''
  ];

  const Z_SAFE = 2.0;
  const Z_CUT = -0.1;
  const FEED_RATE = 200;

  // 1. Drill Pads
  lines.push('(Drilling Pads)');
  components.forEach(comp => {
    // Junctions (PIN) are not real physical components and should not be drilled
    if (comp.footprintId === 'PIN') return;

    const footprint = getFootprint(comp.footprintId);
    if (!footprint) return;
    footprint.pins.forEach(pin => {
      const pos = getPinGlobalPos(comp, pin);
      lines.push(`G0 X${pos.x.toFixed(3)} Y${pos.y.toFixed(3)}`);
      lines.push(`G1 Z${Z_CUT} F${FEED_RATE}`);
      lines.push(`G0 Z${Z_SAFE}`);
    });
  });

  // 2. Mill Traces
  lines.push('\n(Milling Traces)');
  traces.forEach(trace => {
    const fromPin = allPins.find(p => p.id === trace.fromPinId);
    const toPin = allPins.find(p => p.id === trace.toPinId);
    if (!fromPin || !toPin) return;

    const fromComp = components.find(c => c.id === fromPin.componentId);
    const toComp = components.find(c => c.id === toPin.componentId);
    if (!fromComp || !toComp) return;

    const start = getPinGlobalPos(fromComp, fromPin);
    const end = getPinGlobalPos(toComp, toPin);
    const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(start, end, trace);

    lines.push(`(Trace ${trace.id})`);
    lines.push(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`);
    lines.push(`G1 Z${Z_CUT} F${FEED_RATE}`);
    
    // Subdivide into 15 steps for the curve for better precision
    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Cubic Bezier Formula
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;

      const x = mt3 * start.x + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * end.x;
      const y = mt3 * start.y + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * end.y;
      
      lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)}`);
    }

    lines.push(`G0 Z${Z_SAFE}`);
  });

  lines.push('\nM5 (Spindle Off)');
  lines.push('G0 X0 Y0 (Return Home)');
  lines.push('M30 (End Program)');

  return lines.join('\n');
};