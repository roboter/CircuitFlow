
export interface Vector2 {
  x: number;
  y: number;
}

export interface Pin {
  id: string;
  componentId: string;
  name: string;
  localPos: Vector2;
  type: 'io' | 'power' | 'ground';
  // Added globalPos to support coordinate calculations in design engine
  globalPos?: Vector2;
}

export interface Footprint {
  id: string;
  name: string;
  width: number;
  height: number;
  pins: Pin[];
  valueType?: 'resistance' | 'capacitance'; // Dynamic property type
}

export interface PCBComponent {
  id: string;
  footprintId: string;
  name: string;
  position: Vector2;
  rotation: number; // in degrees
  value?: string; // e.g., "10k", "100uF"
}

export interface Trace {
  id: string;
  fromPinId: string;
  toPinId: string;
  width: number;
  color: string;
  c1Offset?: Vector2; // Manual offset for first control point relative to start pin
  c2Offset?: Vector2; // Manual offset for second control point relative to end pin
}

export interface DRCError {
  type: 'overlap' | 'clearance' | 'orphan';
  message: string;
  location: Vector2;
  relatedIds: string[];
}
