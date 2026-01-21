import { Footprint } from './types';

export const GRID_SIZE = 254.0; // Scaled up 10x
export const SNAP_SIZE = 25.4; // 0.1 inch standard pitch

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
    ]
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
    "valueType": "resistance"
  },
  {
    "id": "capacitor",
    "name": "Capacitor (0.1\")",
    "width": 50.8,
    "height": 50.8,
    "pins": [
      {"id": "1", "componentId": "", "name": "1", "localPos": {"x": 12.7, "y": 25.4}, "type": "io"},
      {"id": "2", "componentId": "", "name": "2", "localPos": {"x": 38.1, "y": 25.4}, "type": "io"}
    ],
    "valueType": "capacitance"
  },
  {
    "id": "dip_8",
    "name": "DIP-8 IC",
    "width": 127.0,
    "height": 127.0,
    "pins": [
      {"id": "p1", "componentId": "", "name": "1", "localPos": {"x": 25.4, "y": 25.4}, "type": "io"},
      {"id": "p2", "componentId": "", "name": "2", "localPos": {"x": 25.4, "y": 50.8}, "type": "io"},
      {"id": "p3", "componentId": "", "name": "3", "localPos": {"x": 25.4, "y": 76.2}, "type": "io"},
      {"id": "p4", "componentId": "", "name": "4", "localPos": {"x": 25.4, "y": 101.6}, "type": "io"},
      {"id": "p5", "componentId": "", "name": "5", "localPos": {"x": 101.6, "y": 101.6}, "type": "io"},
      {"id": "p6", "componentId": "", "name": "6", "localPos": {"x": 101.6, "y": 76.2}, "type": "io"},
      {"id": "p7", "componentId": "", "name": "7", "localPos": {"x": 101.6, "y": 50.8}, "type": "io"},
      {"id": "p8", "componentId": "", "name": "8", "localPos": {"x": 101.6, "y": 25.4}, "type": "io"}
    ]
  },
  {
    "id": "header_4",
    "name": "4-Pin Header",
    "width": 50.8,
    "height": 127.0,
    "pins": [
      {"id": "p1", "componentId": "", "name": "1", "localPos": {"x": 25.4, "y": 25.4}, "type": "io"},
      {"id": "p2", "componentId": "", "name": "2", "localPos": {"x": 25.4, "y": 50.8}, "type": "io"},
      {"id": "p3", "componentId": "", "name": "3", "localPos": {"x": 25.4, "y": 76.2}, "type": "io"},
      {"id": "p4", "componentId": "", "name": "4", "localPos": {"x": 25.4, "y": 101.6}, "type": "io"}
    ]
  },
  {
    "id": "led",
    "name": "LED 5mm",
    "width": 50.8,
    "height": 50.8,
    "pins": [
      {"id": "A", "componentId": "", "name": "A", "localPos": {"x": 12.7, "y": 25.4}, "type": "io"},
      {"id": "K", "componentId": "", "name": "K", "localPos": {"x": 38.1, "y": 25.4}, "type": "io"}
    ]
  },
  {
    "id": "pin",
    "name": "Pin (Single Pad)",
    "width": 25.4,
    "height": 25.4,
    "pins": [
      {"id": "p1", "componentId": "", "name": "Pin", "localPos": {"x": 12.7, "y": 12.7}, "type": "io"}
    ]
  },
  {
    "id": "PIN",
    "name": "Junction",
    "width": 25.4,
    "height": 25.4,
    "pins": [
      {"id": "p1", "componentId": "", "name": "J", "localPos": {"x": 12.7, "y": 12.7}, "type": "io"}
    ]
  }
];