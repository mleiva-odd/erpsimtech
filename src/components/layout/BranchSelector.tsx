'use client';

import { useState, useEffect } from 'react';
import { useBranchStore } from '@/stores/branchStore';
import { Store, ChevronDown } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface Branch {
  id: string;
  name: string;
  code: string;
  isMain: boolean;
}

interface Props {
  isCollapsed?: boolean;
}

export function BranchSelector({ isCollapsed = false }: Props) {
  const { data: session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const { selectedBranchId, setSelectedBranchId } = useBranchStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const role = session?.user?.role;
  const isAdminOrSuper = role === 'ADMIN' || role === 'SUPER_ADMIN';

  useEffect(() => {
    if (session?.user?.companyId) {
      fetch('/api/branches')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setBranches(data);
          else if (data.branches) setBranches(data.branches);
        })
        .catch(err => console.error(err));
    }
  }, [session]);

  const activeBranchName = selectedBranchId 
    ? branches.find(b => b.id === selectedBranchId)?.name 
    : "Visión Global Corporativa";

  // Si no es admin, solo mostramos el nombre de su sucursal si la sabemos y no hace nada
  if (!isAdminOrSuper) {
    const localBranchName = session?.user?.branchId 
      ? (branches.length === 0 ? 'Cargando tienda...' : (branches.find(b => b.id === session.user.branchId)?.name || 'Sucursal Asignada'))
      : 'Modo Local';

    return (
      <div className={`mx-3 mb-4 flex items-center justify-center p-2 rounded-xl bg-slate-800/50 border border-slate-700`}>
        <Store className="w-4 h-4 text-slate-400 shrink-0" />
        {!isCollapsed && (
          <span className="ml-2 text-xs font-bold text-slate-300 truncate">
            {localBranchName}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative mx-3 mb-4">
      <button 
        onClick={() => setDropdownOpen(!dropdownOpen)}
        title={isCollapsed ? activeBranchName : 'Seleccionar Tienda'}
        className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2.5'} rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors group`}
      >
        <div className="flex items-center text-left min-w-0">
          <div className="shrink-0 w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Store className="w-3.5 h-3.5" />
          </div>
          {!isCollapsed && (
             <div className="ml-2 min-w-0">
               <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-0.5">Viendo</div>
               <div className="text-xs font-bold text-white truncate leading-tight group-hover:text-indigo-300 transition-colors">
                 {activeBranchName}
               </div>
             </div>
          )}
        </div>
        {!isCollapsed && <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />}
      </button>

      {dropdownOpen && !isCollapsed && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-20">
          <button 
            onClick={() => { setSelectedBranchId(null); setDropdownOpen(false); }}
            className={`w-full text-left px-3 py-2.5 text-xs font-bold hover:bg-slate-700 transition-colors ${!selectedBranchId ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-300'}`}
          >
            Visión Global (Todas)
          </button>
          <div className="h-px bg-slate-700/50" />
          <div className="max-h-40 overflow-y-auto custom-scrollbar">
            {branches.map(b => (
              <button 
                key={b.id}
                onClick={() => { setSelectedBranchId(b.id); setDropdownOpen(false); }}
                className={`w-full text-left px-3 py-2.5 text-xs font-medium hover:bg-slate-700 transition-colors truncate ${selectedBranchId === b.id ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-300'}`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
