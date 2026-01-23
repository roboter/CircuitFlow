import React from 'react';
import { FOOTPRINTS } from './constants';
import { 
  CircuitBoard, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  FileCode, 
  Download, 
  Save, 
  Upload, 
  RefreshCw, 
  Sparkles,
  Plus
} from 'lucide-react';

// Import custom icons as components
import { Resistor } from './icons/Resistor';
import { CapacitorElectrolytic } from './icons/CapacitorElectrolytic';
import { CapacitorCeramic } from './icons/CapacitorCeramic';
import { LED } from './icons/LED';
import { Diode } from './icons/Diode';
import { Transistor } from './icons/Transistor';
import { Inductor } from './icons/Inductor';
import { ArduinoNano } from './icons/ArduinoNano';
import { DIP } from './icons/DIP';
import { Header } from './icons/Header';
import { PinIcon } from './icons/Pin';

interface SidebarProps {
  pendingFootprintId: string | null;
  onLibraryClick: (fid: string) => void;
  lastCheckResult: 'none' | 'pass' | 'fail';
  invalidTraceCount: number;
  isDrcRunning: boolean;
  runDRC: () => void;
  exportToSVG: () => void;
  exportToGRBL: () => void;
  saveProject: () => void;
  loadProject: () => void;
  loadExample: () => void;
}

// Map IDs to their corresponding React components
const ICON_MAP: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'resistor': Resistor,
  'capacitor_electrolytic': CapacitorElectrolytic,
  'capacitor_ceramic': CapacitorCeramic,
  'led': LED,
  'diode': Diode,
  'transistor': Transistor,
  'inductor': Inductor,
  'arduino_nano': ArduinoNano,
  'dip': DIP,
  'header': Header,
  'pin': PinIcon
};

const Sidebar: React.FC<SidebarProps> = ({
  pendingFootprintId, onLibraryClick, lastCheckResult, invalidTraceCount,
  isDrcRunning, runDRC, exportToSVG, exportToGRBL, saveProject, loadProject, loadExample
}) => {
  return (
    <div className="w-64 bg-[#0A1A0F] border-r border-[#1A4A23] flex flex-col p-4 gap-6 z-10 shadow-xl">
      <div className="flex items-center gap-3 px-2">
        <CircuitBoard className="text-emerald-500" size={24} />
        <h1 className="font-bold text-xl tracking-tight text-white italic">CircuitFlow</h1>
      </div>
      
      <div className="flex flex-col gap-4 overflow-hidden">
        <label className="text-[10px] font-black text-emerald-900 uppercase tracking-widest px-2 opacity-50">LIBRARY</label>
        <div className="grid grid-cols-3 gap-2 overflow-y-auto pr-1 scrollbar-none max-h-[50vh]">
          {FOOTPRINTS.filter(f => f.id !== 'JUNCTION').map(f => {
            const isPending = pendingFootprintId === f.id;
            const IconComponent = ICON_MAP[f.id];
            
            return (
              <button 
                key={f.id} 
                onClick={() => onLibraryClick(f.id)} 
                title={f.name}
                className={`flex items-center justify-center aspect-square p-2 rounded-xl border transition-all ${
                  isPending 
                    ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-emerald-500 hover:bg-[#152B1B] hover:text-emerald-400'
                }`}
              >
                <div className="w-full h-full flex items-center justify-center p-1">
                  {IconComponent ? (
                    <IconComponent width="100%" height="100%" />
                  ) : (
                    <Plus size={20} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-4 border-t border-[#1A4A23] pt-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">DRC STATUS</span>
            <button 
              onClick={(e) => { e.stopPropagation(); runDRC(); }} 
              className="hover:bg-zinc-800 p-1.5 rounded-lg text-zinc-500 hover:text-emerald-500 transition-colors"
            >
              <RefreshCw size={14} className={isDrcRunning ? "animate-spin" : ""} />
            </button>
          </div>
          <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
            lastCheckResult === 'fail' 
              ? 'bg-red-500/10 border-red-500/50 text-red-400' 
              : lastCheckResult === 'pass' 
                ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                : 'bg-zinc-950 border-zinc-800 text-zinc-500'
          }`}>
            <div className="shrink-0">
              {lastCheckResult === 'fail' ? <AlertTriangle size={24} /> : lastCheckResult === 'pass' ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}
            </div>
            <span className="text-xs font-black tracking-widest uppercase">
              {isDrcRunning ? 'Analyzing...' : lastCheckResult === 'fail' ? `${invalidTraceCount} Faults` : lastCheckResult === 'pass' ? 'Clear' : 'Idle'}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <button onClick={exportToSVG} className="flex flex-col items-center justify-center gap-1 p-3 bg-zinc-900 hover:bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-900/50 transition-all font-black text-[10px] uppercase group">
            <FileCode size={18} className="group-hover:scale-110 transition-transform" /> 
            SVG
          </button>
          <button onClick={exportToGRBL} className="flex flex-col items-center justify-center gap-1 p-3 bg-zinc-900 hover:bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-900/50 transition-all font-black text-[10px] uppercase group">
            <Download size={18} className="group-hover:scale-110 transition-transform" /> 
            GRBL
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={saveProject} className="flex flex-col items-center justify-center gap-1 p-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all font-black text-[10px] uppercase shadow-lg shadow-emerald-900/10">
            <Save size={18} /> 
            Save
          </button>
          <button onClick={loadProject} className="flex flex-col items-center justify-center gap-1 p-3 bg-zinc-100 hover:bg-white text-black rounded-xl transition-all font-black text-[10px] uppercase">
            <Upload size={18} /> 
            Load
          </button>
        </div>
        <button onClick={loadExample} className="w-full flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl transition-all font-black text-[10px] uppercase shadow-lg shadow-emerald-900/20">
          <Sparkles size={16} /> Load Example Project
        </button>
      </div>
    </div>
  );
};

export default Sidebar;