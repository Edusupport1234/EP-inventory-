import React, { useState, useEffect } from 'react';
import { History as HistoryIcon, ArrowUpRight, ArrowDownRight, User, Package, Clock, Search, MapPin, Layers, Info } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, onSnapshot, query, orderBy, handleFirestoreError, OperationType, auth } from '@/src/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface Adjustment {
  id: string;
  ts: any; // Firestore Timestamp
  item: string;
  itemId: string;
  location: string;
  delta: number;
  actor: string;
  purpose?: string;
  takenBy?: string;
  reason?: string;
  adjustedBy?: string;
}

export default function History() {
  const [logs, setLogs] = useState<Adjustment[]>([]);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'adjustments'), orderBy('ts', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Adjustment));
      setLogs(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'adjustments');
    });
    return () => unsubscribe();
  }, [user]);

  const filteredLogs = logs.filter(log => 
    log.item.toLowerCase().includes(search.toLowerCase()) ||
    log.actor.toLowerCase().includes(search.toLowerCase()) ||
    (log.purpose && log.purpose.toLowerCase().includes(search.toLowerCase())) ||
    (log.location && log.location.toLowerCase().includes(search.toLowerCase()))
  );

  const formatDate = (ts: any) => {
    if (!ts) return 'Just now';
    try {
      const date = ts.toDate();
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date);
    } catch (e) {
      return 'Recent';
    }
  };

  // KPI Calculations
  const totalAdjustmentsCount = logs.length;
  const totalAddedAmount = logs.filter(l => l.delta > 0).reduce((acc, l) => acc + l.delta, 0);
  const totalSubtractedAmount = logs.filter(l => l.delta < 0).reduce((acc, l) => acc + Math.abs(l.delta), 0);

  const getLocationBadgeStyle = (location: string) => {
    const loc = (location || '').toLowerCase();
    if (loc.includes('old')) {
      return 'bg-orange-50 text-orange-700 border-orange-100';
    } else if (loc.includes('new')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    } else if (loc.includes('office')) {
      return 'bg-amber-50 text-amber-700 border-amber-100';
    }
    return 'bg-slate-50 text-slate-700 border-slate-100';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-[#f05a3e] shrink-0" />
            Audit Ledger Hub
          </h1>
          <p className="text-slate-500 text-[10.5px] uppercase tracking-wider font-extrabold mt-1">
            Real-time stock modification tracking & database synchronizer
          </p>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex -space-x-1.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6.5 h-6.5 rounded-full border-2 border-white bg-orange-50 text-[#f05a3e] flex items-center justify-center text-[8.5px] font-black uppercase ring-1 ring-slate-100 shadow-3xs">
                  U{i}
                </div>
              ))}
           </div>
           <span className="h-5 w-[1px] bg-slate-205 mx-1"></span>
           <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              Live Ledger Connected
           </span>
         </div>
      </header>

      {/* KPI Stats Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Total Logs Registered</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-slate-800">{totalAdjustmentsCount}</span>
            <span className="text-[9.5px] text-slate-400 font-bold uppercase">Actions</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1 mt-3">
            <div className="bg-[#f05a3e] h-1 rounded-full" style={{ width: '100%' }}></div>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Overall Stock Inflows</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-emerald-600">+{totalAddedAmount}</span>
            <span className="text-[9.5px] text-slate-400 font-bold uppercase">Units</span>
          </div>
          <p className="text-[9px] text-emerald-600/80 font-bold mt-2.5 uppercase tracking-wide flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 strike-[2.5]" />
            Newly registered products
          </p>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Overall Stock Outflows</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-rose-600">-{totalSubtractedAmount}</span>
            <span className="text-[9.5px] text-slate-400 font-bold uppercase">Units</span>
          </div>
          <p className="text-[9px] text-rose-600/80 font-bold mt-2.5 uppercase tracking-wide flex items-center gap-1">
            <ArrowDownRight className="w-3.5 h-3.5 strike-[2.5]" />
            Deducted for loan or logistics
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by product, adjuster, reason, location, or team..." 
            className="w-full bg-slate-50 border border-slate-200 focus:border-[#f05a3e] hover:bg-slate-150 focus:bg-white rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-700 outline-none transition-all shadow-inner focus:ring-4 focus:ring-[#f05a3e]/10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-[10px] text-slate-450 font-bold uppercase tracking-widest pr-1">
          Showing {filteredLogs.length} of {totalAdjustmentsCount} entries
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4.5 text-[9.5px] font-black text-slate-500 uppercase tracking-widest">Adjusted Period</th>
                <th className="px-6 py-4.5 text-[9.5px] font-black text-slate-500 uppercase tracking-widest text-center">Magnitude Change</th>
                <th className="px-6 py-4.5 text-[9.5px] font-black text-slate-500 uppercase tracking-widest">Product Information</th>
                <th className="px-6 py-4.5 text-[9.5px] font-black text-slate-500 uppercase tracking-widest">Registered Facility</th>
                <th className="px-6 py-4.5 text-[9.5px] font-black text-slate-500 uppercase tracking-widest font-sans">Authorized Specialist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence>
                {filteredLogs.map((log, idx) => (
                  <motion.tr 
                    key={log.id ? `hist-log-${log.id}-${idx}` : `hist-log-idx-${idx}`}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(10, idx) * 0.02 }}
                    className="hover:bg-slate-50/60 transition-colors group cursor-default"
                  >
                    {/* Timestamp */}
                    <td className="px-6 py-4.5">
                      <div className="flex items-center gap-2.5">
                        <Clock className="w-4 h-4 text-slate-350" />
                        <div className="flex flex-col">
                          <span className="text-[11.5px] font-bold text-slate-800">{formatDate(log.ts)}</span>
                          <span className="text-[8.5px] text-slate-400 font-bold font-mono tracking-wider mt-0.5 uppercase">ID: {log.id ? log.id.slice(0, 8) : 'CLIENT-V'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Magnitude */}
                    <td className="px-6 py-4.5 align-middle text-center">
                      <div className="inline-flex">
                        <span className={cn(
                          "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[10.5px] font-black tracking-tighter shadow-3xs uppercase font-mono border",
                          log.delta > 0 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-150" 
                            : "bg-rose-50 text-rose-700 border-rose-150"
                        )}>
                          {log.delta > 0 ? <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDownRight className="w-3.5 h-3.5 stroke-[2.5]" />}
                          {log.delta > 0 ? `+${log.delta}` : log.delta}
                        </span>
                      </div>
                    </td>

                    {/* Product / Reason Details */}
                    <td className="px-6 py-4.5">
                      <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/65 flex items-center justify-center group-hover:bg-orange-50 group-hover:border-orange-200 shrink-0 shadow-3xs transition-all">
                          <Package className="w-4.5 h-4.5 text-slate-500 group-hover:text-[#f05a3e] transition-colors" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[12.5px] font-extrabold text-slate-800 uppercase block tracking-tight truncate">{log.item}</span>
                          <div className="flex items-center gap-1 mt-1 text-[10.5px] text-slate-500 leading-none">
                            <Info className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">Reason: {log.purpose || log.reason || 'Inventory Adjustment'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Facility Region */}
                    <td className="px-6 py-4.5">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider border shadow-3xs select-none",
                        getLocationBadgeStyle(log.location)
                      )}>
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>{log.location || 'Old warehouse'}</span>
                      </div>
                    </td>

                    {/* Adjusted operator */}
                    <td className="px-6 py-4.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-150 group-hover:bg-orange-100 border border-slate-200/60 flex items-center justify-center transition-colors">
                          <User className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#f05a3e] transition-colors" />
                        </div>
                        <div className="flex flex-col">
                          <p className="text-[11px] font-bold text-slate-700 leading-none transition-colors group-hover:text-[#f05a3e]">{log.actor || 'N/A'}</p>
                          {(log.takenBy && log.takenBy !== log.actor) && (
                            <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider mt-1">Recipient: {log.takenBy}</span>
                          )}
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                       <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-400 mb-4 animate-pulse">
                         <HistoryIcon className="w-7 h-7" />
                       </div>
                       <p className="text-xs font-black text-slate-700 uppercase tracking-widest">No matching activities found</p>
                       <p className="text-[10px] text-slate-400 font-semibold mt-1.5 text-center">
                         We couldn't locate any logs for "{search}". Try searching with a different keyword.
                       </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
