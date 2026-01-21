# ⚡ CircuitFlow

### Precision PCB Design for iPad & Desktop
**CircuitFlow** is a lightweight, high-performance PCB design tool optimized for through-hole prototyping. Designed for engineers and makers who need to move quickly from a breadboard concept to a CNC-milled PCB.

---

## 📸 Interface Preview

<div align="center">
  <svg width="600" height="350" viewBox="0 0 600 350" fill="none" xmlns="http://www.w3.org/2000/svg" style="border-radius: 12px; border: 1px solid #1a4a23; background: #050c07;">
    <!-- Grid -->
    <defs>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="#152b1b" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" />
    
    <!-- Component Mockup -->
    <rect x="100" y="80" width="80" height="180" rx="8" fill="#0a1a0f" stroke="#34d399" stroke-width="2" />
    <text x="140" y="70" text-anchor="middle" fill="#34d399" font-family="monospace" font-size="10" font-weight="bold">ARDUINO_NANO</text>
    <circle cx="115" cy="100" r="4" fill="#fcd34d" />
    <circle cx="115" cy="120" r="4" fill="#fcd34d" />
    <circle cx="115" cy="140" r="4" fill="#fcd34d" />
    
    <!-- Trace Mockup -->
    <path d="M 115 100 C 180 100, 220 200, 300 200" stroke="#10b981" stroke-width="6" fill="none" stroke-linecap="round" />
    <circle cx="300" cy="200" r="8" fill="#fcd34d" stroke="#0a1a0f" stroke-width="2" />
    <text x="315" y="205" fill="#10b981" font-family="monospace" font-size="8">VCC_OUT</text>
    
    <!-- DRC Error Mockup -->
    <circle cx="210" cy="155" r="15" fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" stroke-dasharray="3,2" />
    
    <!-- UI Overlay -->
    <rect x="10" y="10" width="120" height="40" rx="10" fill="rgba(10, 26, 15, 0.9)" stroke="#1a4a23" />
    <text x="25" y="35" fill="#34d399" font-family="sans-serif" font-weight="900" font-size="14">CircuitFlow</text>
  </svg>
  <p><i>Conceptual rendering of the CircuitFlow Bezier engine and DRC system.</i></p>
</div>

---

## 🚀 Key Features

### 1. Curved Trace Engine
Forget rigid 45-degree angles. CircuitFlow uses **Cubic Bezier curves** for all routing, allowing for organic, high-performance layouts that minimize signal reflections and look stunning.

### 2. SVG-Matrix Precision
The app implements a custom coordinate mapping system using `getScreenCTM`. This ensures that every tap on an iPad or click on a 4K monitor is accurate to the sub-pixel, regardless of your current zoom level or pan position.

### 3. Real-Time DRC (Design Rule Check)
The background DRC engine constantly monitors your board for:
*   **Clearance Violations**: Ensures traces aren't too close to unrelated pads.
*   **Trace Collisions**: Prevents short circuits between different nets.
*   **Visual Feedback**: Glowing red markers pulse over problematic areas instantly.

### 4. CNC Ready
Directly export your design to **GRBL-compatible G-Code**. 
*   **Drill Cycles**: Automatic G0/G1 drilling blocks for all through-hole pads.
*   **Milling Paths**: High-precision subdivided Bezier paths for trace isolation.

---

## 🛠 Tech Stack

- **Framework**: React 19 (ESM)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Engine**: Native SVG with coordinate matrix transformations
- **Mathematics**: Cubic Bezier interpolation and Euclidean distance collision detection

---

## 📖 How to Use

1.  **Select a Component**: Click any footprint in the left sidebar (e.g., Arduino Nano).
2.  **Place**: Tap anywhere on the grid to drop the part. Parts snap to a 2.54mm (0.1") grid.
3.  **Route**: Click any yellow pin and drag to another pin. A curved yellow preview will guide you.
4.  **Inspect**: Click a trace to reveal its **Track Width** slider in the right sidebar.
5.  **Check**: Hit the **Run DRC Check** button to verify your board health.
6.  **Export**: Click **Export GRBL** to download a `.nc` file ready for your CNC machine.

---

Developed with ❤️ by Senior Frontend Engineering.
