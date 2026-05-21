import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, TrendingUp, AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownRight, Plus, Scan, Tag, X, ChevronRight, Hash } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/src/lib/utils';
import { db, collection, addDoc, onSnapshot, serverTimestamp, updateDoc, doc, arrayUnion, query, orderBy, handleFirestoreError, OperationType, auth, rtdb, ref, onValue, set, update } from '@/src/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Html5Qrcode } from 'html5-qrcode';

// Mock data for initial UI if DB is empty
const defaultChartData = [
  { name: 'Jan', stock: 4000 },
  { name: 'Feb', stock: 3000 },
  { name: 'Mar', stock: 2000 },
  { name: 'Apr', stock: 2780 },
  { name: 'May', stock: 1890 },
  { name: 'Jun', stock: 2390 },
  { name: 'Jul', stock: 3490 },
];

export default function Dashboard() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);
  
  // Form State
  const [newItem, setNewItem] = useState({ name: '', qty: '', location: 'Old warehouse' });
  
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    let firestoreItems: any[] = [];
    let rtdbItems: any[] = [];

    const handleMerge = () => {
      const mergedMap = new Map<string, any>();
      rtdbItems.forEach(item => mergedMap.set(item.id, item));
      firestoreItems.forEach(item => mergedMap.set(item.id, item));
      setInventory(Array.from(mergedMap.values()));
    };

    // 1. Subscribe Firestore
    const q = query(collection(db, 'inventory'));
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      firestoreItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMerge();
    }, (error) => {
      console.warn("Firestore dashboard subscription loaded with error/ignored:", error);
    });

    // 2. Subscribe RTDB
    let unsubscribeRtdb = () => {};
    try {
      const rtdbRef = ref(rtdb, 'inventory');
      const rtdbUnsub = onValue(rtdbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          rtdbItems = Object.entries(data).map(([key, value]: [string, any]) => {
            if (typeof value === 'object' && value !== null) {
              return {
                id: key,
                ...value,
                name: value.name || value.itemName || 'Unnamed Item',
                qty: value.qty ?? value.quantity ?? 0,
                qtyOld: value.qtyOld ?? value.quantityOld ?? 0,
                qtyNew: value.qtyNew ?? value.quantityNew ?? 0,
                qtyOffice: value.qtyOffice ?? value.quantityOffice ?? 0,
              };
            }
            return { id: key, name: String(value), qty: 1 };
          });
        } else {
          rtdbItems = [];
        }
        handleMerge();
      }, (err) => {
        console.warn("RTDB dashboard listener loaded with error/ignored:", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB dashboard load error:", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.qty) return;

    try {
      const qtyNum = parseInt(newItem.qty);
      const existing = inventory.find(i => i.name.toLowerCase() === newItem.name.toLowerCase());

      if (existing) {
        const fieldMap: Record<string, string> = {
          'Old warehouse': 'qtyOld',
          'New warehouse': 'qtyNew',
          'Office': 'qtyOffice'
        };
        const field = fieldMap[newItem.location] || 'qtyOld';
        const currentQty = existing[field] || 0;
        const finalQty = (existing.qty || 0) + qtyNum;

        // Write to Firestore
        await updateDoc(doc(db, 'inventory', existing.id), {
          [field]: currentQty + qtyNum,
          qty: finalQty,
          isNew: true
        });

        // Write/sync to Realtime Database
        try {
          await update(ref(rtdb, `inventory/${existing.id}`), {
            [field]: currentQty + qtyNum,
            qty: finalQty,
            isNew: true
          });
        } catch (e) {}
      } else {
        const qtyOld = newItem.location === 'Old warehouse' ? qtyNum : 0;
        const qtyNew = newItem.location === 'New warehouse' ? qtyNum : 0;
        const qtyOffice = newItem.location === 'Office' ? qtyNum : 0;

        // Custom document ID to match in both
        const customId = doc(collection(db, 'inventory')).id;

        // Write to Firestore
        await set(ref(rtdb, `inventory/${customId}`), {
          name: newItem.name,
          qtyOld,
          qtyNew,
          qtyOffice,
          qty: qtyNum,
          goal: 0,
          barcodes: [],
          isNew: true,
          createdAt: Date.now()
        });

        await updateDoc(doc(db, 'inventory', customId), {
          name: newItem.name,
          qtyOld,
          qtyNew,
          qtyOffice,
          qty: qtyNum,
          goal: 0,
          barcodes: [],
          isNew: true,
          createdAt: serverTimestamp()
        }).catch(async () => {
          // If updateDoc fails (doc doesn't exist yet for set), write with setDoc
          const { setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'inventory', customId), {
            name: newItem.name,
            qtyOld,
            qtyNew,
            qtyOffice,
            qty: qtyNum,
            goal: 0,
            barcodes: [],
            isNew: true,
            createdAt: serverTimestamp()
          });
        });
      }
      setIsAddModalOpen(false);
      setNewItem({ name: '', qty: '', location: 'Old warehouse' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const startScanner = async () => {
    setIsScannerOpen(true);
    setScannedCode(null);
    // Timeout to ensure the element is in the DOM
    setTimeout(async () => {
      const html5QrCode = new Html5Qrcode("reader");
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setScannedCode(decodedText);
            html5QrCode.stop();
          },
          () => {}
        );
      } catch (err) {
        console.error(err);
      }
    }, 100);
  };

  const stats = [
    { label: 'Total Inventory', value: inventory.reduce((acc, curr) => acc + (curr.qty || 0), 0).toLocaleString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', change: '+12%', positive: true },
    { label: 'Registered SKU', value: inventory.length, icon: Tag, color: 'text-emerald-600', bg: 'bg-emerald-50', change: '+8%', positive: true },
    { label: 'Low Stock Items', value: inventory.filter(i => i.qty < 5).length, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', change: '-3%', positive: false },
    { label: 'Warehouse Load', value: '88%', icon: CheckCircle2, color: 'text-rose-600', bg: 'bg-rose-50', change: '0%', positive: true },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">System Perspective</h1>
          <p className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">StratosCore Integration Hub</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded text-[11px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Stock
          </button>
          <button 
            onClick={startScanner}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-[11px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95"
          >
            <Scan className="w-3.5 h-3.5" />
            Quick Scan
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            key={`stat-${stat.label}-${idx}`}
            className="p-5 bg-white rounded-lg border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={cn("p-1.5 rounded bg-slate-50 border border-slate-100 shrink-0")}>
                <stat.icon className={cn("w-4 h-4 text-slate-500")} />
              </div>
              <div className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                stat.positive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {stat.change}
              </div>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest leading-none">{stat.label}</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 p-6 bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Stock Dynamics</h3>
            <div className="flex gap-1">
               <button className="px-2 py-1 text-[10px] font-bold bg-slate-900 text-white rounded">W</button>
               <button className="px-2 py-1 text-[10px] font-bold bg-slate-50 text-slate-400 rounded">M</button>
               <button className="px-2 py-1 text-[10px] font-bold bg-slate-50 text-slate-400 rounded">Y</button>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={defaultChartData}>
                <defs>
                  <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="stock" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorStock)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Operations Log */}
        <div className="p-6 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight mb-6">Operations Log</h3>
          <div className="space-y-6 flex-1 max-h-[300px] overflow-y-auto">
            {inventory.slice(0, 5).map((item, idx) => (
              <div key={item.id ? `dash-log-${item.id}-${idx}` : `dash-log-idx-${idx}`} className="flex gap-3">
                <div className="w-1.5 h-1.5 mt-1.5 rounded-full shrink-0 bg-blue-500"></div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-800 leading-none">{item.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">Stock: {item.qty} | {item.location || 'Central'}</p>
                  <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Just updated</p>
                </div>
              </div>
            ))}
            {inventory.length === 0 && (
              <p className="text-xs text-slate-400 italic">No recent activity detected.</p>
            )}
          </div>
          <button className="w-full mt-6 py-3 text-[11px] font-bold text-white bg-slate-900 rounded transition-all hover:bg-slate-800 uppercase tracking-widest">
            Execute Full Audit
          </button>
        </div>
      </div>

      {/* Modals Implementation */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-800 tracking-tight text-lg uppercase tracking-[0.1em]">New Stock Entry</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleAddItem} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item Name</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={newItem.name}
                      onChange={e => setNewItem({...newItem, name: e.target.value})}
                      placeholder="e.g. mBot2 Robot" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-blue-100 outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
                    <input 
                      type="number" 
                      value={newItem.qty}
                      onChange={e => setNewItem({...newItem, qty: e.target.value})}
                      placeholder="0" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-blue-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Storage Unit</label>
                    <select 
                      value={newItem.location}
                      onChange={e => setNewItem({...newItem, location: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-blue-100 outline-none"
                    >
                      <option>Old warehouse</option>
                      <option>New warehouse</option>
                      <option>Office</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded font-bold text-[11px] uppercase tracking-widest mt-4 shadow-lg active:scale-95 transition-all">
                  Confirm Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isScannerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsScannerOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              className="relative w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-800 tracking-tight text-sm uppercase tracking-widest">Stratos Scan</h2>
                <button onClick={() => setIsScannerOpen(false)} className="p-1 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6">
                {!scannedCode ? (
                  <div id="reader" className="w-full aspect-square bg-black rounded-lg overflow-hidden"></div>
                ) : (
                  <div className="space-y-6 text-center">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">Barcode Recognized</h3>
                      <p className="text-slate-500 font-mono text-sm mt-1">{scannedCode}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                       <button className="py-3 bg-blue-600 text-white rounded font-bold text-[11px] uppercase tracking-widest">
                          Increment Stock (+1)
                       </button>
                       <button onClick={startScanner} className="py-3 bg-slate-900 text-white rounded font-bold text-[11px] uppercase tracking-widest">
                          Re-scan
                       </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
