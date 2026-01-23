import { Vector2, PCBComponent, Footprint, Trace, Pin } from '../types';
import { getFootprint } from '../constants';

export const getPinGlobalPos = (component: PCBComponent, pin: Pin): Vector2 => {
  const rad = (component.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const footprint = getFootprint(component.footprintId);
  if (!footprint) return component.position;

  const cx = footprint.width / 2;
  const cy = footprint.height / 2;

  const lx = pin.localPos.x - cx;
  const ly = pin.localPos.y - cy;

  const nx = lx * cos - ly * sin;
  const ny = lx * sin + ly * cos;

  return {
    x: component.position.x + nx + cx,
    y: component.position.y + ny + cy
  };
};

export const getBezierControlPoints = (start: Vector2, end: Vector2, trace?: Trace) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const useHorizontal = Math.abs(dx) >= Math.abs(dy);
  const autoTensionFactor = 0.45;
  const minTension = 30;

  let cx1, cy1, cx2, cy2;

  if (trace?.c1Offset) {
    cx1 = start.x + trace.c1Offset.x;
    cy1 = start.y + trace.c1Offset.y;
  } else {
    if (useHorizontal) {
      const tension = Math.sign(dx) * Math.max(Math.abs(dx * autoTensionFactor), minTension);
      cx1 = start.x + tension;
      cy1 = start.y;
    } else {
      const tension = Math.sign(dy) * Math.max(Math.abs(dy * autoTensionFactor), minTension);
      cx1 = start.x;
      cy1 = start.y + tension;
    }
  }

  if (trace?.c2Offset) {
    cx2 = end.x + trace.c2Offset.x;
    cy2 = end.y + trace.c2Offset.y;
  } else {
    if (useHorizontal) {
      const tension = Math.sign(dx) * Math.max(Math.abs(dx * autoTensionFactor), minTension);
      cx2 = end.x - tension;
      cy2 = end.y;
    } else {
      const tension = Math.sign(dy) * Math.max(Math.abs(dy * autoTensionFactor), minTension);
      cx2 = end.x;
      cy2 = end.y - tension;
    }
  }

  return { cx1, cy1, cx2, cy2 };
};

export const generateBezierPath = (start: Vector2, end: Vector2, trace?: Trace): string => {
  const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(start, end, trace);
  return `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;
};

export const getPointOnBezier = (t: number, start: Vector2, end: Vector2, trace?: Trace): Vector2 => {
  const { cx1, cy1, cx2, cy2 } = getBezierControlPoints(start, end, trace);
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return {
    x: mt3 * start.x + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * end.x,
    y: mt3 * start.y + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * end.y
  };
};

export const checkCollision = (p1: Vector2, p2: Vector2, minDistance: number): boolean => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return (dx * dx + dy * dy) < (minDistance * minDistance);
};

export const findConnectedTraces = (startTraceId: string, allTraces: Trace[], allComponents: PCBComponent[]): string[] => {
  const result = new Set<string>();
  const queue = [startTraceId];
  const junctionCompIds = new Set(allComponents.filter(c => c.footprintId === 'JUNCTION').map(c => c.id));

  while (queue.length > 0) {
    const tid = queue.shift()!;
    if (result.has(tid)) continue;
    result.add(tid);

    const trace = allTraces.find(t => t.id === tid);
    if (!trace) continue;

    const pins = [trace.fromPinId, trace.toPinId];
    for (const pinId of pins) {
      // Correct component ID extraction from pin ID (everything before the last '_')
      const lastUnderscore = pinId.lastIndexOf('_');
      const compId = lastUnderscore !== -1 ? pinId.substring(0, lastUnderscore) : pinId;

      if (junctionCompIds.has(compId)) {
        // Any trace connected to ANY pin of this junction component is connected
        // Though junctions usually have 1 pin, this is safer.
        const neighbors = allTraces.filter(t => t.id !== tid && (
          t.fromPinId.startsWith(compId + '_') || t.toPinId.startsWith(compId + '_')
        ));
        for (const n of neighbors) {
          if (!result.has(n.id)) queue.push(n.id);
        }
      }
    }
  }
  return Array.from(result);
};