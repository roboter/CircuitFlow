
import { Footprint } from './types';

export const GRID_SIZE = 254.0; // Scaled up 10x (approx 100 pixels per cm)
export const SNAP_SIZE = GRID_SIZE / 10; // 25.4px = 0.1 inch standard pitch

export const FOOTPRINTS: Footprint[] = [
  {
    id: 'arduino_nano',
    name: 'Arduino Nano',
    width: 8 * SNAP_SIZE,
    height: 17 * SNAP_SIZE,
    pins: Array.from({ length: 30 }, (_, i) => ({
      id: `pin_${i}`,
      componentId: '',
      name: i < 15 ? `L${i + 1}` : `R${30 - i}`,
      localPos: {
        x: i < 15 ? 1 * SNAP_SIZE : 7 * SNAP_SIZE,
        y: 1 * SNAP_SIZE + (i % 15) * SNAP_SIZE
      },
      type: 'io'
    }))
  },
  {
    id: 'pin_th',
    name: 'PIN (Through-hole)',
    width: 1.5 * SNAP_SIZE,
    height: 1.5 * SNAP_SIZE,
    pins: [
      { id: 'p1', componentId: '', name: 'PAD', localPos: { x: 0.75 * SNAP_SIZE, y: 0.75 * SNAP_SIZE }, type: 'io' }
    ]
  },
  {
    id: 'resistor',
    name: 'Resistor (0.4")',
    width: 6 * SNAP_SIZE,
    height: 1.5 * SNAP_SIZE,
    pins: [
      { id: '1', componentId: '', name: '1', localPos: { x: 1 * SNAP_SIZE, y: 0.75 * SNAP_SIZE }, type: 'io' },
      { id: '2', componentId: '', name: '2', localPos: { x: 5 * SNAP_SIZE, y: 0.75 * SNAP_SIZE }, type: 'io' },
    ]
  },
  {
    id: 'led',
    name: 'LED 5mm',
    width: 2.5 * SNAP_SIZE,
    height: 2.5 * SNAP_SIZE,
    pins: [
      { id: 'A', componentId: '', name: 'Anode', localPos: { x: 0.75 * SNAP_SIZE, y: 1.25 * SNAP_SIZE }, type: 'io' },
      { id: 'K', componentId: '', name: 'Cathode', localPos: { x: 1.75 * SNAP_SIZE, y: 1.25 * SNAP_SIZE }, type: 'io' },
    ]
  },
  {
    id: 'capacitor_radial',
    name: 'Capacitor Radial',
    width: 2.5 * SNAP_SIZE,
    height: 2.5 * SNAP_SIZE,
    pins: [
      { id: 'pos', componentId: '', name: '+', localPos: { x: 0.75 * SNAP_SIZE, y: 1.25 * SNAP_SIZE }, type: 'power' },
      { id: 'neg', componentId: '', name: '-', localPos: { x: 1.75 * SNAP_SIZE, y: 1.25 * SNAP_SIZE }, type: 'ground' },
    ]
  },
  {
    id: 'dip_8',
    name: 'DIP-8 IC',
    width: 4 * SNAP_SIZE,
    height: 5 * SNAP_SIZE,
    pins: Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      componentId: '',
      name: `${i + 1}`,
      localPos: {
        x: i < 4 ? 0.5 * SNAP_SIZE : 3.5 * SNAP_SIZE,
        y: 1 * SNAP_SIZE + (i < 4 ? i : 7 - i) * SNAP_SIZE
      },
      type: 'io'
    }))
  },
  {
    id: 'header_4',
    name: '4-Pin Header',
    width: 1.5 * SNAP_SIZE,
    height: 4.5 * SNAP_SIZE,
    pins: Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      componentId: '',
      name: `${i + 1}`,
      localPos: { x: 0.75 * SNAP_SIZE, y: 0.75 * SNAP_SIZE + i * SNAP_SIZE },
      type: 'io'
    }))
  },
  {
    id: 'junction',
    name: 'Trace Junction',
    width: 1 * SNAP_SIZE,
    height: 1 * SNAP_SIZE,
    pins: [
      { id: 'j', componentId: '', name: 'J', localPos: { x: 0.5 * SNAP_SIZE, y: 0.5 * SNAP_SIZE }, type: 'io' }
    ]
  }
];
