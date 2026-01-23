
import { Footprint, Pin } from './types';

export const GRID_SIZE = 254.0; // Scaled up 10x
export const SNAP_SIZE = 25.4; // 0.1 inch standard pitch

/**
 * Generates a standard DIP footprint with given pin count.
 */
export const generateDIPFootprint = (pinCount: number): Footprint => {
  const pitch = 25.4;
  const rowSpacing = pinCount >= 24 ? 152.4 : 76.2;
  const padding = 25.4;
  const pinsPerRow = Math.ceil(pinCount / 2);
  
  const width = rowSpacing + padding * 2;
  const height = (pinsPerRow - 1) * pitch + padding * 2;
  
  const pins: Pin[] = [];
  
  for (let i = 0; i < pinsPerRow; i++) {
    pins.push({
      id: `p${i + 1}`,
      componentId: "",
      name: `${i + 1}`,
      localPos: { x: padding, y: padding + i * pitch },
      type: "io"
    });
  }
  
  for (let i = 0; i < pinsPerRow; i++) {
    const pinIndex = pinsPerRow + i;
    if (pinIndex >= pinCount) break;
    pins.push({
      id: `p${pinIndex + 1}`,
      componentId: "",
      name: `${pinIndex + 1}`,
      localPos: { x: padding + rowSpacing, y: padding + (pinsPerRow - 1 - i) * pitch },
      type: "io"
    });
  }

  return {
    id: `dip_${pinCount}`,
    name: `DIP-${pinCount} IC`,
    width,
    height,
    pins,
    shape: 'rect'
  };
};

export const generateHeaderFootprint = (pinCount: number): Footprint => {
  const pitch = 25.4;
  const padding = 25.4;
  const width = padding * 2;
  const height = (pinCount - 1) * pitch + padding * 2;
  
  const pins: Pin[] = [];
  for (let i = 0; i < pinCount; i++) {
    pins.push({
      id: `p${i + 1}`,
      componentId: "",
      name: `${i + 1}`,
      localPos: { x: padding, y: padding + i * pitch },
      type: "io"
    });
  }

  return {
    id: `header_${pinCount}`,
    name: `${pinCount}-Pin Header`,
    width,
    height,
    pins,
    shape: 'rect'
  };
};

export const FOOTPRINTS: Footprint[] = [
  {
    "id": "arduino_nano",
    "name": "Arduino Nano",
    "width": 203.2,
    "height": 431.8,
    "pins": [
      {"id": "p1", "componentId": "", "name": "D13", "localPos": {"x": 25.4, "y": 25.4}, "type": "io"},
      {"id": "p2", "componentId": "", "name": "3V3", "localPos": {"x": 25.4, "y": 50.8}, "type": "power"},
      {"id": "p3", "componentId": "", "name": "REF", "localPos": {"x": 25.4, "y": 76.2}, "type": "io"},
      {"id": "p4", "componentId": "", "name": "A0", "localPos": {"x": 25.4, "y": 101.6}, "type": "io"},
      {"id": "p5", "componentId": "", "name": "A1", "localPos": {"x": 25.4, "y": 127.0}, "type": "io"},
      {"id": "p6", "componentId": "", "name": "A2", "localPos": {"x": 25.4, "y": 152.4}, "type": "io"},
      {"id": "p7", "componentId": "", "name": "A3", "localPos": {"x": 25.4, "y": 177.8}, "type": "io"},
      {"id": "p8", "componentId": "", "name": "A4", "localPos": {"x": 25.4, "y": 203.2}, "type": "io"},
      {"id": "p9", "componentId": "", "name": "A5", "localPos": {"x": 25.4, "y": 228.6}, "type": "io"},
      {"id": "p10", "componentId": "", "name": "A6", "localPos": {"x": 25.4, "y": 254.0}, "type": "io"},
      {"id": "p11", "componentId": "", "name": "A7", "localPos": {"x": 25.4, "y": 279.4}, "type": "io"},
      {"id": "p12", "componentId": "", "name": "5V", "localPos": {"x": 25.4, "y": 304.8}, "type": "power"},
      {"id": "p13", "componentId": "", "name": "RST", "localPos": {"x": 25.4, "y": 330.2}, "type": "io"},
      {"id": "p14", "componentId": "", "name": "GND", "localPos": {"x": 25.4, "y": 355.6}, "type": "ground"},
      {"id": "p15", "componentId": "", "name": "VIN", "localPos": {"x": 25.4, "y": 381.0}, "type": "power"},
      {"id": "p16", "componentId": "", "name": "TX", "localPos": {"x": 177.8, "y": 25.4}, "type": "io"},
      {"id": "p17", "componentId": "", "name": "RX", "localPos": {"x": 177.8, "y": 50.8}, "type": "io"},
      {"id": "p18", "componentId": "", "name": "RST", "localPos": {"x": 177.8, "y": 76.2}, "type": "io"},
      {"id": "p19", "componentId": "", "name": "GND", "localPos": {"x": 177.8, "y": 101.6}, "type": "ground"},
      {"id": "p20", "componentId": "", "name": "D2", "localPos": {"x": 177.8, "y": 127.0}, "type": "io"},
      {"id": "p21", "componentId": "", "name": "D3", "localPos": {"x": 177.8, "y": 152.4}, "type": "io"},
      {"id": "p22", "componentId": "", "name": "D4", "localPos": {"x": 177.8, "y": 177.8}, "type": "io"},
      {"id": "p23", "componentId": "", "name": "D5", "localPos": {"x": 177.8, "y": 203.2}, "type": "io"},
      {"id": "p24", "componentId": "", "name": "D6", "localPos": {"x": 177.8, "y": 228.6}, "type": "io"},
      {"id": "p25", "componentId": "", "name": "D7", "localPos": {"x": 177.8, "y": 254.0}, "type": "io"},
      {"id": "p26", "componentId": "", "name": "D8", "localPos": {"x": 177.8, "y": 279.4}, "type": "io"},
      {"id": "p27", "componentId": "", "name": "D9", "localPos": {"x": 177.8, "y": 304.8}, "type": "io"},
      {"id": "p28", "componentId": "", "name": "D10", "localPos": {"x": 177.8, "y": 330.2}, "type": "io"},
      {"id": "p29", "componentId": "", "name": "D11", "localPos": {"x": 177.8, "y": 355.6}, "type": "io"},
      {"id": "p30", "componentId": "", "name": "D12", "localPos": {"x": 177.8, "y": 381.0}, "type": "io"}
    ],
    "shape": 'rect'
  },
  {
    "id": "resistor",
    "name": "Resistor (0.4\")",
    "width": 152.4,
    "height": 50.8,
    "pins": [
      {"id": "1", "componentId": "", "name": "1", "localPos": {"x": 25.4, "y": 25.4}, "type": "io"},
      {"id": "2", "componentId": "", "name": "2", "localPos": {"x": 127.0, "y": 25.4}, "type": "io"}
    ],
    "valueType": "resistance",
    "shape": 'rect'
  },
  {
    "id": "capacitor_electrolytic",
    "name": "Electrolytic Cap",
    "width": 50.8,
    "height": 50.8,
    "pins": [
      {"id": "1", "componentId": "", "name": "+", "localPos": {"x": 12.7, "y": 25.4}, "type": "io", "decoration": "plus"},
      {"id": "2", "componentId": "", "name": "-", "localPos": {"x": 38.1, "y": 25.4}, "type": "io"}
    ],
    "valueType": "capacitance",
    "shape": 'circle'
  },
  {
    "id": "capacitor_ceramic",
    "name": "Ceramic Cap",
    "width": 50.8,
    "height": 25.4,
    "pins": [
      {"id": "1", "componentId": "", "name": "1", "localPos": {"x": 12.7, "y": 12.7}, "type": "io"},
      {"id": "2", "componentId": "", "name": "2", "localPos": {"x": 38.1, "y": 12.7}, "type": "io"}
    ],
    "valueType": "capacitance",
    "shape": 'rect'
  },
  {
    "id": "led",
    "name": "LED 5mm",
    "width": 50.8,
    "height": 50.8,
    "pins": [
      {"id": "A", "componentId": "", "name": "A", "localPos": {"x": 12.7, "y": 25.4}, "type": "io", "decoration": "plus"},
      {"id": "K", "componentId": "", "name": "K", "localPos": {"x": 38.1, "y": 25.4}, "type": "io", "decoration": "notch"}
    ],
    "shape": 'circle'
  },
  {
    "id": "diode",
    "name": "Diode (0.3\")",
    "width": 101.6,
    "height": 38.1,
    "pins": [
      {"id": "A", "componentId": "", "name": "A", "localPos": {"x": 25.4, "y": 19.05}, "type": "io"},
      {"id": "K", "componentId": "", "name": "K", "localPos": {"x": 76.2, "y": 19.05}, "type": "io"}
    ],
    "shape": 'rect'
  },
  {
    "id": "inductor",
    "name": "Power Inductor",
    "width": 76.2,
    "height": 76.2,
    "pins": [
      {"id": "1", "componentId": "", "name": "1", "localPos": {"x": 12.7, "y": 38.1}, "type": "io"},
      {"id": "2", "componentId": "", "name": "2", "localPos": {"x": 63.5, "y": 38.1}, "type": "io"}
    ],
    "valueType": "inductance",
    "shape": 'rect'
  },
  {
    "id": "transistor",
    "name": "TO-92 Transistor",
    "width": 76.2,
    "height": 50.8,
    "pins": [
      {"id": "1", "componentId": "", "name": "1", "localPos": {"x": 12.7, "y": 25.4}, "type": "io"},
      {"id": "2", "componentId": "", "name": "2", "localPos": {"x": 38.1, "y": 25.4}, "type": "io"},
      {"id": "3", "componentId": "", "name": "3", "localPos": {"x": 63.5, "y": 25.4}, "type": "io"}
    ],
    "shape": 'rect'
  },
  {
    "id": "pin",
    "name": "Pin (Single Pad)",
    "width": 25.4,
    "height": 25.4,
    "pins": [
      {"id": "p1", "componentId": "", "name": "Pin", "localPos": {"x": 12.7, "y": 12.7}, "type": "io"}
    ],
    "shape": 'rect'
  },
  {
    "id": "dip",
    "name": "DIP IC",
    "width": 127.0,
    "height": 101.6,
    "pins": [],
    "shape": 'rect'
  },
  {
    "id": "header",
    "name": "Pin Header",
    "width": 50.8,
    "height": 50.8,
    "pins": [],
    "shape": 'rect'
  }
];

// Junction is a system footprint, not in user library
const JUNCTION_FOOTPRINT: Footprint = {
  "id": "JUNCTION",
  "name": "Junction",
  "width": 25.4,
  "height": 25.4,
  "pins": [
    {"id": "p1", "componentId": "", "name": "J", "localPos": {"x": 12.7, "y": 12.7}, "type": "io"}
  ],
  "shape": 'circle'
};

export const getFootprint = (id: string): Footprint | undefined => {
  if (id === 'JUNCTION') return JUNCTION_FOOTPRINT;
  if (id.startsWith('dip_')) {
    const pins = parseInt(id.replace('dip_', ''));
    return generateDIPFootprint(pins);
  }
  if (id.startsWith('header_')) {
    const pins = parseInt(id.replace('header_', ''));
    return generateHeaderFootprint(pins);
  }
  return FOOTPRINTS.find(f => f.id === id);
};
