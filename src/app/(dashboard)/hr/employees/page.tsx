'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Search, Filter, Loader2, Mail, Phone, MapPin, Briefcase, DollarSign, Edit2 } from 'lucide-react';
import { EmployeeModal } from '@/components/hr/EmployeeModal';

interface EmployeeRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  position: string | null;
  documentId: string | null;
  baseSalary: number | string;
  branch?: {
    name: string;
  } | null;
}

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/hr/employees');
      const data = await res.json();
      if (Array.isArray(data)) setEmployees(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const filteredEmployees = employees.filter((emp) => 
    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.documentId?.includes(searchTerm)
  );

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            Expedientes de Personal
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Gestión centralizada de colaboradores y registros laborales</p>
        </div>
        <button
          onClick={() => { setSelectedEmployee(null); setIsModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-xl shadow-blue-500/10 flex items-center gap-2.5 transition-all active:scale-95"
        >
          <UserPlus className="w-4 h-4" /> Alta de Colaborador
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por nombre, puesto o DPI..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all text-sm font-medium"
          />
        </div>
        <button className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-all">
          <Filter className="w-4 h-4" /> Filtros
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-20" />
          </div>
        ) : filteredEmployees.length > 0 ? (
          filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              onClick={() => router.push(`/hr/employees/${emp.id}`)}
              className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all group relative overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp); setIsModalOpen(true); }}
                  className="p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 text-xl shadow-sm">
                  {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{emp.firstName} {emp.lastName}</h3>
                  <div className="flex items-center gap-1.5 text-blue-600 font-bold text-[10px] uppercase tracking-wider">
                    <Briefcase className="w-3 h-3" /> {emp.position || 'Puesto no asignado'}
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-slate-500">
                  <Mail className="w-4 h-4" />
                  <span className="text-xs font-medium">{emp.email || 'Sin correo'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <Phone className="w-4 h-4" />
                  <span className="text-xs font-medium">{emp.phone || 'Sin teléfono'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <MapPin className="w-4 h-4" />
                  <span className="text-xs font-medium line-clamp-1">{emp.address || 'Sin dirección'}</span>
                </div>
              </div>

              <div className="pt-5 border-t border-slate-50 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Salario Base</span>
                  <div className="flex items-center gap-1 text-emerald-600 font-bold">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>{Number(emp.baseSalary).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  {emp.branch?.name || 'Global'}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-medium">No se encontraron colaboradores.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <EmployeeModal
          employee={selectedEmployee}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => { setIsModalOpen(false); fetchEmployees(); }}
        />
      )}
    </div>
  );
}
