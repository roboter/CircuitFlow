
import React from 'react';
import { MousePointer2, Hand, Undo2, Target, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

interface ToolbarProps {
  tool: 'select' | 'pan';
  setTool: (tool: 'select' | 'pan') => void;
  undo: () => void;
  canUndo: boolean;
  centerView: () => void;
  rotateSelected: () => void;
  deleteSelected: () => void;
  handleZoom: (delta: number) => void;
  scale: number;
  selectionSize: number;
}

const Toolbar: React.FC<ToolbarProps> = ({
  tool, setTool, undo, canUndo, centerView, rotateSelected, deleteSelected, handleZoom, scale, selectionSize
}) => {
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-[#0A1A0F]/90 backdrop-blur-md border border-[#1A4A23] rounded-2xl shadow-2xl z-20">
      <button onClick={() => setTool('select')} className={`p-3 rounded-xl transition-all ${tool === 'select' ? 'bg-emerald-500 text-black' : 'text-emerald-900 hover:bg-[#152B1B]'}`}><MousePointer2 size={20} /></button>
      <button onClick={() => setTool('pan')} className={`p-3 rounded-xl transition-all ${tool === 'pan' ? 'bg-emerald-500 text-black' : 'text-emerald-900 hover:bg-[#152B1B]'}`}><Hand size={20} /></button>
      <div className="w-px h-6 bg-zinc-800 mx-1" />
      <button onClick={undo} className="p-3 text-emerald-500 hover:bg-[#152B1B] rounded-xl disabled:opacity-20" disabled={!canUndo}><Undo2 size={20} /></button>
      <button onClick={centerView} className="p-3 text-emerald-500 hover:bg-[#152B1B] rounded-xl"><Target size={20} /></button>
      <button onClick={rotateSelected} className="p-3 text-emerald-500 hover:bg-[#152B1B] rounded-xl disabled:opacity-30" disabled={selectionSize === 0}><RotateCw size={20} /></button>
      <button onClick={deleteSelected} className="p-3 text-emerald-500 hover:bg-red-500/20 hover:text-red-400 rounded-xl disabled:opacity-30" disabled={selectionSize === 0}><Trash2 size={20} /></button>
      <div className="w-px h-6 bg-zinc-800 mx-1" />
      <div className="flex items-center gap-1 bg-zinc-950/50 rounded-xl px-2">
        <button className="p-2 text-zinc-400 hover:text-white" onClick={() => handleZoom(1)}><ZoomIn size={16} /></button>
        <span className="text-[10px] font-mono text-zinc-600 w-12 text-center">{Math.round(scale * 100)}%</span>
        <button className="p-2 text-zinc-400 hover:text-white" onClick={() => handleZoom(-1)}><ZoomOut size={16} /></button>
      </div>
    </div>
  );
};

export default Toolbar;
