import React from 'react';
import { Trace } from './types';
import { Activity, Palette, Trash2 } from 'lucide-react';

const TRACE_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#10b981' },
  { name: 'Yellow', value: '#f59e0b' },
];

interface TraceEditorProps {
  traces: Trace[];
  onUpdate: (id: string, updates: Partial<Trace>) => void;
  onDelete: () => void;
}

const TraceEditor: React.FC<TraceEditorProps> = ({ traces, onUpdate, onDelete }) => {
  if (traces.length === 0) return null;

  return (
    <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Activity size={18} style={{ color: traces[0].color }} />
        <h3 className="text-xs font-black uppercase tracking-tight">
          {traces.length > 1 ? `Whole Trace (${traces.length} segs)` : 'Trace Properties'}
        </h3>
      </div>
      
      <div className="flex flex-col gap-3">
        <label className="text-[10px] text-emerald-900 font-black uppercase">Track Width</label>
        <input 
          type="range" min="1" max="50" 
          value={traces[0].width} 
          onChange={(e) => onUpdate(traces[0].id, { width: parseInt(e.target.value) })} 
          className="w-full accent-emerald-500 bg-[#050C07] h-2 rounded-full appearance-none" 
        />
        <span className="text-[10px] font-mono text-emerald-500 text-center">{traces[0].width} MIL</span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <Palette size={12} className="text-emerald-900" />
          <label className="text-[10px] text-emerald-900 font-black uppercase">Color</label>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {TRACE_COLORS.map(color => (
            <button
              key={color.value}
              onClick={() => onUpdate(traces[0].id, { color: color.value })}
              className={`group relative h-10 rounded-xl border-2 transition-all flex items-center justify-center ${
                traces.every(t => t.color === color.value) 
                  ? 'border-white scale-105 shadow-lg' 
                  : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              title={color.name}
            >
              {traces.every(t => t.color === color.value) && (
                <div className="absolute inset-0 bg-white/20 rounded-lg animate-pulse" />
              )}
            </button>
          ))}
        </div>
      </div>

      <button onClick={onDelete} className="w-full p-4 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors">
        <Trash2 size={16} className="inline mr-2" /> Delete Path
      </button>
    </div>
  );
};

export default TraceEditor;