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

/**
 * Calculates control points for a smooth curve.
 * Uses manual offsets if provided, otherwise auto-calculates based on dominant axis
 * to ensure traces project in a sensible direction (top/bottom or left/right).
 */
export const getBezierControlPoints = (start: Vector2, end: Vector2, trace?: Trace) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  
  // Smart auto-tangent: follow the dominant axis between pins
  const useHorizontal = Math.abs(dx) >= Math.abs(dy);
  const autoTensionFactor = 0.45;
  const minTension = 30;

  let cx1, cy1, cx2, cy2;

  // Calculate Start Control Point (C1)
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

  // Calculate End Control Point (C2)
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