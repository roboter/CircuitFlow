import React from 'react';
import { PCBComponent, Trace } from './types';
import { Settings2, Eye } from 'lucide-react';
import TraceEditor from './TraceEditor';
import ComponentEditor from './ComponentEditor';

interface InspectorProps {
  selectedComponents: PCBComponent[];
  selectedTraces: Trace[];
  hoveredCompId: string | null;
  onMouseEnterItem: (id: string | null) => void;
  onUpdateComponent: (id: string, updates: Partial<PCBComponent>) => void;
  onUpdateTrace: (id: string, updates: Partial<Trace>) => void;
  onRemoveItem: (id: string) => void;
  onClearSelection: () => void;
  onIsolate: (id: string) => void;
  getFootprint: (id: string) => any;
  deleteSelected: () => void;
}

const Inspector: React.FC<InspectorProps> = ({
  selectedComponents, selectedTraces, hoveredCompId, onMouseEnterItem,
  onUpdateComponent, onUpdateTrace, onRemoveItem, onClearSelection, onIsolate,
  getFootprint, deleteSelected
}) => {
  const totalCount = selectedComponents.length + selectedTraces.length;
  const isBulkTraces = selectedTraces.length > 0 && selectedComponents.length === 0;

  return (
    <div className="w-80 bg-[#0A1A0F] border-l border-[#1A4A23] p-4 flex flex-col gap-6 z-10 shadow-2xl overflow-y-auto scrollbar-thin">
      <div className="flex items-center gap-3 px-2">
        <Settings2 size={16} className="text-emerald-900" />
        <h2 className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">Inspector</h2>
      </div>

      {isBulkTraces ? (
        <TraceEditor 
          traces={selectedTraces} 
          onUpdate={onUpdateTrace} 
          onDelete={deleteSelected} 
        />
      ) : totalCount > 1 ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black uppercase tracking-widest">Selection Stack</h3>
            <button onClick={onClearSelection} className="text-[10px] font-black text-emerald-900 hover:text-red-400 uppercase tracking-tight">Clear All</button>
          </div>
          <div className="flex flex-col gap-1.5">
            {[...selectedComponents, ...selectedTraces].map(item => {
              const isComp = 'footprintId' in item;
              const name = isComp ? (item as PCBComponent).name : `Trace ${item.id.slice(-4)}`;
              return (
                <div 
                  key={item.id} 
                  onMouseEnter={() => onMouseEnterItem(item.id)}
                  onMouseLeave={() => onMouseEnterItem(null)}
                  className={`group flex items-center justify-between bg-zinc-950 border ${hoveredCompId === item.id ? 'border-emerald-500' : 'border-zinc-800'} p-3 rounded-xl cursor-pointer transition-colors`}
                  onClick={() => onIsolate(item.id)}
                >
                  <span className="text-[11px] font-bold truncate">{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : selectedComponents.length === 1 ? (
        <ComponentEditor 
          comp={selectedComponents[0]} 
          footprint={getFootprint(selectedComponents[0].footprintId)}
          onUpdate={onUpdateComponent}
          onDelete={deleteSelected}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-800/50">
          <Eye size={36} className="text-emerald-900 mb-6" />
          <p className="text-[11px] font-black text-emerald-900/60 text-center uppercase tracking-widest">Select an item to inspect</p>
        </div>
      )}
    </div>
  );
};

export default Inspector;