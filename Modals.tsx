
import React from 'react';
import { X, Hash, SlidersHorizontal, Plus } from 'lucide-react';

interface ModalsProps {
  modalMode: 'ic' | 'header' | null;
  setModalMode: (mode: 'ic' | 'header' | null) => void;
  headerPinCount: number;
  setHeaderPinCount: (count: number) => void;
  setPendingFootprintId: (id: string | null) => void;
}

const Modals: React.FC<ModalsProps> = ({ modalMode, setModalMode, headerPinCount, setHeaderPinCount, setPendingFootprintId }) => {
  if (!modalMode) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="bg-[#0A1A0F] border border-[#1A4A23] rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl">{modalMode === 'ic' ? <Hash className="text-emerald-500" size={24} /> : <SlidersHorizontal className="text-emerald-500" size={24} />}</div>
            <h2 className="text-xl font-black italic text-white uppercase">{modalMode === 'ic' ? 'IC PIN COUNT' : 'HEADER SIZE'}</h2>
          </div>
          <button onClick={() => setModalMode(null)} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-500"><X size={24} /></button>
        </div>

        {modalMode === 'ic' ? (
          <div className="grid grid-cols-4 gap-3">
            {[6, 8, 14, 16, 18, 20, 24, 28].map(count => (
              <button key={count} onClick={() => { setPendingFootprintId(`dip_${count}`); setModalMode(null); }} className="py-4 bg-zinc-950 border border-zinc-800 hover:border-emerald-500 rounded-2xl font-black text-lg text-white hover:text-emerald-500 transition-all">{count}</button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <input type="range" min="1" max="20" step="1" value={headerPinCount} onChange={(e) => setHeaderPinCount(parseInt(e.target.value))} className="w-full accent-emerald-500" />
            <button onClick={() => { setPendingFootprintId(`header_${headerPinCount}`); setModalMode(null); }} className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-widest"><Plus size={18} className="inline mr-2" /> Place {headerPinCount}-Pin Header</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Modals;
