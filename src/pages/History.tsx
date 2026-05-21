import React, { useState, useEffect } from 'react';
import { History as HistoryIcon, ArrowUpRight, ArrowDownRight, User, Package, Clock, Search, MapPin, Tag } from 'lucide-react';
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
    if (!ts) return 'N/A';
    const date = ts.toDate();
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Audit Trail</h1>
          <p className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold italic">Stock Modification Ledger</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">
                  U{i}
                </div>
              ))}
           </div>
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">Sync Active</p>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by SKU, Operator, Reason, or Region..." 
            className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 pl-10 pr-4 text-xs font-medium outline-none focus:bg-white focus:ring-1 focus:ring-blue-100 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temporal Signature</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Magnitude</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entity Context</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Spatial Coord</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authorized By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence>
                {filteredLogs.map((log, idx) => (
                  <motion.tr 
                    key={log.id ? `hist-log-${log.id}-${idx}` : `hist-log-idx-${idx}`}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="hover:bg-slate-50/80 transition-all group cursor-default"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-[11px] font-bold text-slate-700">{formatDate(log.ts)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "flex items-center gap-1.5 w-fit px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter",
                        log.delta > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {log.delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {log.delta > 0 ? `+${log.delta}` : log.delta}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center border border-slate-200 shadow-sm group-hover:scale-110 transition-transform">
                          <Package className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{log.item}</p>
                          <p className="text-[10px] text-slate-400 italic">Purpose: {log.purpose || log.reason || 'Inventory Adjustment'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-slate-900 rounded text-white w-fit">
                        <MapPin className="w-2.5 h-2.5" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">{log.location}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
                          <User className="w-2.5 h-2.5 text-blue-500" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">{log.actor}</span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center opacity-30">
                       <HistoryIcon className="w-12 h-12 mb-4" />
                       <p className="text-xs font-bold uppercase tracking-[0.3em]">No Temporal Records Located</p>
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
