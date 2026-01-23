import React from 'react';
import { PCBComponent } from './types';
import { Layers, Lock, Unlock, Zap, Trash2, GitCommit, Split, AlignCenter } from 'lucide-react';

interface ComponentEditorProps {
  comp: PCBComponent;
  footprint: any;
  onUpdate: (id: string, updates: Partial<PCBComponent>) => void;
  onDelete: () => void;
}

const ComponentEditor: React.FC<ComponentEditorProps> = ({ comp, footprint, onUpdate, onDelete }) => {
  const isJunction = comp.footprintId === 'JUNCTION';

  return (
    <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isJunction ? <GitCommit size={18} className="text-emerald-500" /> : <Layers size={18} className="text-emerald-500" />}
          <h3 className="text-xs font-black uppercase tracking-widest">
            {isJunction ? 'Junction' : 'Properties'}
          </h3>
        </div>
        <button 
          onClick={() => onUpdate(comp.id, { locked: !comp.locked })}
          className={`p-2 rounded-lg border transition-all ${comp.locked ? 'bg-red-500 border-red-400 text-black' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}
          title={comp.locked ? "Unlock component" : "Lock component"}
        >
          {comp.locked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
      </div>

      {isJunction && (
        <div className="flex flex-col gap-3">
          <label className="text-[10px] text-emerald-900 font-black uppercase">Junction Continuity</label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => onUpdate(comp.id, { junctionType: 'smooth' })}
              className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[9px] font-black uppercase transition-all ${comp.junctionType === 'smooth' || !comp.junctionType ? 'bg-emerald-500 border-emerald-400 text-black' : 'bg-[#050C07] border-zinc-800'}`}
            >
              <GitCommit size={14} /> Smooth
            </button>
            <button
              onClick={() => onUpdate(comp.id, { junctionType: 'linear' })}
              className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[9px] font-black uppercase transition-all ${comp.junctionType === 'linear' ? 'bg-emerald-500 border-emerald-400 text-black' : 'bg-[#050C07] border-zinc-800'}`}
            >
              <AlignCenter size={14} /> Linear
            </button>
            <button
              onClick={() => onUpdate(comp.id, { junctionType: 'independent' })}
              className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[9px] font-black uppercase transition-all ${comp.junctionType === 'independent' ? 'bg-emerald-500 border-emerald-400 text-black' : 'bg-[#050C07] border-zinc-800'}`}
            >
              <Split size={14} /> Sharp
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-[10px] text-emerald-900 font-black uppercase">Designator</label>
        <input 
          type="text" 
          value={comp.name} 
          onChange={(e) => onUpdate(comp.id, { name: e.target.value })} 
          className="w-full bg-[#050C07] border border-zinc-800 p-3 rounded-xl text-sm" 
        />
      </div>

      {footprint && footprint.valueType && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-emerald-900 font-black uppercase">
            {footprint.valueType.charAt(0).toUpperCase() + footprint.valueType.slice(1)}
          </label>
          <div className="relative">
            <input 
              type="text" 
              value={comp.value || ''} 
              onChange={(e) => onUpdate(comp.id, { value: e.target.value })} 
              className="w-full bg-[#050C07] border border-zinc-800 p-3 rounded-xl text-sm pl-11" 
            />
            <Zap size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/40" />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <label className="text-[10px] text-emerald-900 font-black uppercase">Position</label>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-600">X</span>
            <input 
              type="number" 
              value={Math.round(comp.position.x)} 
              onChange={(e) => onUpdate(comp.id, { position: { ...comp.position, x: parseFloat(e.target.value) || 0 } })} 
              className="w-full bg-[#050C07] border border-zinc-800 p-3 pl-7 rounded-xl text-sm" 
            />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-600">Y</span>
            <input 
              type="number" 
              value={Math.round(comp.position.y)} 
              onChange={(e) => onUpdate(comp.id, { position: { ...comp.position, y: parseFloat(e.target.value) || 0 } })} 
              className="w-full bg-[#050C07] border border-zinc-800 p-3 pl-7 rounded-xl text-sm" 
            />
          </div>
        </div>
      </div>

      {!isJunction && (
        <div className="flex flex-col gap-3">
          <label className="text-[10px] text-emerald-900 font-black uppercase">Rotation</label>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 90, 180, 270].map(angle => (
              <button 
                key={angle} 
                onClick={() => onUpdate(comp.id, { rotation: angle })} 
                className={`py-3 rounded-xl border text-[11px] font-black ${comp.rotation === angle ? 'bg-emerald-500 border-emerald-400 text-black' : 'bg-[#050C07] border-zinc-800'}`}
              >
                {angle}°
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 p-4 text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors">
        <Trash2 size={18} /> Remove Item
      </button>
    </div>
  );
};

export default ComponentEditor;