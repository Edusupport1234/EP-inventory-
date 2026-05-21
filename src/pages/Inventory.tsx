import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Minus, Edit3, Trash2, X, AlertTriangle, Package, Warehouse, 
  Building2, Landmark, Camera, Image as ImageIcon, ChevronRight, Bookmark, BookmarkCheck, Calendar 
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, setDoc, serverTimestamp, deleteDoc, handleFirestoreError, OperationType, auth, rtdb, ref, onValue, set, update, remove } from '@/src/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Helper to provide realistic high-quality robotics imagery matching the user's products
function getFallbackImage(name: string): string {
  const lowercase = name.toLowerCase();
  if (lowercase.includes('bambu') || lowercase.includes('printer')) {
    return 'https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?w=500&auto=format&fit=crop&q=80'; // 3D Printer
  }
  if (lowercase.includes('drone') || lowercase.includes('propeller') || lowercase.includes('codrone') || lowercase.includes('skykick')) {
    return 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=500&auto=format&fit=crop&q=80'; // Drone
  }
  if (lowercase.includes('makeblock') || lowercase.includes('mbot') || lowercase.includes('cyberpi')) {
    return 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=500&auto=format&fit=crop&q=80'; // Robotics
  }
  if (lowercase.includes('micro:bit') || lowercase.includes('elecfreaks') || lowercase.includes('circuit')) {
    return 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=80'; // Electronics / Microcontroller
  }
  if (lowercase.includes('matatastudio') || lowercase.includes('vincibot') || lowercase.includes('coding')) {
    return 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=500&auto=format&fit=crop&q=80'; // Coding / Stem kits
  }
  return 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=500&auto=format&fit=crop&q=80'; // Engineering / STEM General
}

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [user, setUser] = useState(auth.currentUser);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modal States
  const [adjustModal, setAdjustModal] = useState<{ open: boolean, item: any, mode: 'add' | 'sub' }>({ open: false, item: null, mode: 'add' });
  const [renameModal, setRenameModal] = useState<{ open: boolean, item: any }>({ open: false, item: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean, item: any }>({ open: false, item: null });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form Inputs
  const [adjAmount, setAdjAmount] = useState('1');
  const [adjLocation, setAdjLocation] = useState('Old warehouse');
  const [adjPurpose, setAdjPurpose] = useState('');
  const [adjTakenBy, setAdjTakenBy] = useState('');
  const [newName, setNewName] = useState('');

  // Hold Stock / Reservation Modal State
  const [holdModal, setHoldModal] = useState<{ open: boolean, item: any }>({ open: false, item: null });
  const [holdClientName, setHoldClientName] = useState('');
  const [holdQty, setHoldQty] = useState('1');
  const [holdRemarks, setHoldRemarks] = useState('');
  const [holdOrderId, setHoldOrderId] = useState('');
  const [holdLocation, setHoldLocation] = useState('Old warehouse');

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warn' | 'error' } | null>(null);

  const showToast = (message: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Authentication observer
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // Fetch reservations in real-time (Dual-Sync Firestore & RTDB)
  useEffect(() => {
    let firestoreRecords: any[] = [];
    let rtdbRecords: any[] = [];

    const handleMergeRes = () => {
      const mergedMap = new Map<string, any>();
      rtdbRecords.forEach(record => mergedMap.set(record.id, record));
      firestoreRecords.forEach(record => mergedMap.set(record.id, record));
      setReservations(Array.from(mergedMap.values()));
    };

    // 1. Firestore subscriber
    const q = query(collection(db, 'reservations'));
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      firestoreRecords = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orderId: data.orderId || 'Unknown ORD',
          clientName: data.clientName || 'Unnamed Client',
          itemId: data.itemId || '',
          itemName: data.itemName || 'Unnamed Item',
          qty: Number(data.qty ?? 1),
          rackId: data.rackId || '',
          rackLevel: data.rackLevel !== undefined ? Number(data.rackLevel) : -1,
          status: data.status || 'Packing',
          remarks: data.remarks || '',
          location: data.location || 'Old warehouse',
          actor: data.actor || '',
          ts: data.ts
        };
      });
      handleMergeRes();
    }, (error) => {
      console.warn("Could not load Firestore reservations in Inventory view.", error);
    });

    // 2. RTDB subscriber
    let unsubscribeRtdb = () => {};
    try {
      const rtdbRef = ref(rtdb, 'reservations');
      const rtdbUnsub = onValue(rtdbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          rtdbRecords = Object.entries(data).map(([key, value]: [string, any]) => {
            return {
              id: key,
              ...value,
              orderId: value.orderId || 'Unknown ORD',
              clientName: value.clientName || 'Unnamed Client',
              itemId: value.itemId || '',
              itemName: value.itemName || 'Unnamed Item',
              qty: Number(value.qty ?? 1),
              rackId: value.rackId || '',
              rackLevel: value.rackLevel !== undefined ? Number(value.rackLevel) : -1,
              status: value.status || 'Packing',
              remarks: value.remarks || '',
              location: value.location || 'Old warehouse',
              actor: value.actor || '',
              ts: value.ts || 0
            };
          });
        } else {
          rtdbRecords = [];
        }
        handleMergeRes();
      }, (err) => {
        console.warn("Could not load RTDB reservations in Inventory view.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB reservations subscription failed in Inventory: ", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  // Fetch Inventory items
  useEffect(() => {
    let firestoreItems: any[] = [];
    let rtdbItems: any[] = [];

    const handleMerge = () => {
      const mergedMap = new Map<string, any>();
      rtdbItems.forEach(item => mergedMap.set(item.id, item));
      firestoreItems.forEach(item => mergedMap.set(item.id, item));
      setProducts(Array.from(mergedMap.values()));
    };

    // 1. Subscribe Firestore
    const q = query(collection(db, 'inventory'));
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      firestoreItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMerge();
    }, (error) => {
      console.warn("Firestore collection load ignored or rules restricted.", error);
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
        console.warn("RTDB inventory listener ignored or config missing.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB inventory subscription failed: ", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  // Keyboard shortcut to focus Search Input on '/'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdjust = async () => {
    const { item, mode } = adjustModal;
    if (!item || !adjAmount) return;

    const amt = parseInt(adjAmount);
    if (isNaN(amt) || amt <= 0) return;
    
    const delta = mode === 'add' ? amt : -amt;
    const fieldMap: any = { 'Old warehouse': 'qtyOld', 'New warehouse': 'qtyNew', 'Office': 'qtyOffice' };
    const field = fieldMap[adjLocation];
    
    const prevVal = item[field] || 0;
    const newVal = Math.max(0, prevVal + delta);
    const finalDelta = newVal - prevVal; // Actual magnitude changes
    const targetQty = (item.qty || 0) + finalDelta;

    try {
      // 1. Write to Firestore
      await updateDoc(doc(db, 'inventory', item.id), {
        [field]: newVal,
        qty: targetQty
      });

      // 2. Write to RTDB
      try {
        await update(ref(rtdb, `inventory/${item.id}`), {
          [field]: newVal,
          qty: targetQty
        });
      } catch (e) {}

      await addDoc(collection(db, 'adjustments'), {
        ts: serverTimestamp(),
        item: item.name,
        itemId: item.id,
        location: adjLocation,
        delta: finalDelta,
        actor: user?.email || 'Unknown',
        purpose: adjPurpose,
        takenBy: adjTakenBy
      });

      setAdjustModal({ open: false, item: null, mode: 'add' });
      setAdjAmount('1');
      setAdjPurpose('');
      setAdjTakenBy('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleRename = async () => {
    if (!renameModal.item || !newName) return;
    try {
      await updateDoc(doc(db, 'inventory', renameModal.item.id), { name: newName });
      try {
        await update(ref(rtdb, `inventory/${renameModal.item.id}`), { name: newName });
      } catch (e) {}
      setRenameModal({ open: false, item: null });
      setNewName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.item) return;
    try {
      await deleteDoc(doc(db, 'inventory', deleteModal.item.id));
      try {
        await remove(ref(rtdb, `inventory/${deleteModal.item.id}`));
      } catch (e) {}
      setDeleteModal({ open: false, item: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleCreateHold = async () => {
    if (!holdModal.item || !holdClientName || !holdQty || !holdOrderId) {
      showToast("Please fill in Order ID, Client Name and Quantity", "warn");
      return;
    }
    const qtyNum = parseInt(holdQty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      showToast("Please specify a valid hold quantity greater than 0", "warn");
      return;
    }

    const fieldMap: any = { 
      'Old warehouse': 'qtyOld', 
      'New warehouse': 'qtyNew', 
      'Office': 'qtyOffice' 
    };
    const field = fieldMap[holdLocation] || 'qtyOld';
    const currentLocQty = holdModal.item[field] || 0;

    if (currentLocQty < qtyNum) {
      showToast(`Insufficient stock in ${holdLocation}. Only ${currentLocQty} available.`, "warn");
      return;
    }

    try {
      // 1. Deduct the reserved quantity from the selected warehouse location and overall total
      const newLocQty = Math.max(0, currentLocQty - qtyNum);
      const newTotalQty = Math.max(0, (holdModal.item.qty || 0) - qtyNum);

      // Firestore product update
      try {
        await updateDoc(doc(db, 'inventory', holdModal.item.id), {
          [field]: newLocQty,
          qty: newTotalQty
        });
      } catch (err_f) {
        console.warn("Firestore product update missed:", err_f);
      }

      // RTDB product update
      try {
        await update(ref(rtdb, `inventory/${holdModal.item.id}`), {
          [field]: newLocQty,
          qty: newTotalQty
        });
      } catch (err_rtdb) {
        console.warn("RTDB inventory sync missed", err_rtdb);
      }

      // 2. Clear Firestore FieldValue object from RTDB payload by keeping them separate
      const payloadFirestore = {
        orderId: holdOrderId.trim().toUpperCase(),
        clientName: holdClientName.trim(),
        itemId: holdModal.item.id,
        itemName: holdModal.item.name,
        qty: qtyNum,
        rackId: '',
        rackLevel: -1,
        status: 'Packing',
        remarks: holdRemarks.trim(),
        location: holdLocation,
        actor: user?.email || 'System',
        ts: serverTimestamp()
      };

      // Pre-generate unique ID to ensure synchronization across Firestore and RTDB regardless of network issues
      const targetId = doc(collection(db, 'reservations')).id;

      await setDoc(doc(db, 'reservations', targetId), payloadFirestore);

      // Save to RTDB (safe from non-serializable Firestore FieldValue exceptions)
      const payloadRtdb = {
        orderId: holdOrderId.trim().toUpperCase(),
        clientName: holdClientName.trim(),
        itemId: holdModal.item.id,
        itemName: holdModal.item.name,
        qty: qtyNum,
        rackId: '',
        rackLevel: -1,
        status: 'Packing',
        remarks: holdRemarks.trim(),
        location: holdLocation,
        actor: user?.email || 'System',
        ts: Date.now()
      };

      await set(ref(rtdb, `reservations/${targetId}`), payloadRtdb);

      // 3. Create a corresponding Order Status record in the Status Tracker (statuses collection)
      const statusPayloadFirestore = {
        order: holdOrderId.trim().toUpperCase(),
        item: holdModal.item.name,
        qty: qtyNum,
        status: 'Loan',
        where: holdLocation,
        remarks: holdRemarks.trim() ? `[Stock Hold] ${holdRemarks.trim()}` : '[Stock Hold] Reserved from catalog',
        actor: user?.email || 'System',
        ts: serverTimestamp()
      };

      const statusPayloadRtdb = {
        order: holdOrderId.trim().toUpperCase(),
        item: holdModal.item.name,
        qty: qtyNum,
        status: 'Loan',
        where: holdLocation,
        remarks: holdRemarks.trim() ? `[Stock Hold] ${holdRemarks.trim()}` : '[Stock Hold] Reserved from catalog',
        actor: user?.email || 'System',
        ts: Date.now()
      };

      try {
        try {
          await setDoc(doc(db, 'statuses', targetId), statusPayloadFirestore);
        } catch (status_err_f) {
          console.warn("Firestore status synchronizer failed:", status_err_f);
        }
        await set(ref(rtdb, `statuses/${targetId}`), statusPayloadRtdb);
      } catch (status_err) {
        console.warn("Could not sync reservation with status tracker", status_err);
      }

      showToast(`Successfully created hold ${holdOrderId.toUpperCase()} for ${qtyNum} units in ${holdLocation}!`, "info");
      setHoldModal({ open: false, item: null });
      setHoldClientName('');
      setHoldQty('1');
      setHoldRemarks('');
      setHoldOrderId('');
    } catch (err) {
      console.error("Error creating stock hold:", err);
      showToast("Failed to record stock hold reservation", "error");
    }
  };

  return (
    <div className="min-h-screen bg-white -m-6 p-6 space-y-6 animate-in fade-in duration-500 pb-24">
      
      {/* Target UI Title Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e6decf] pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#1E293B] tracking-tight">Adjust Stock</h1>
        </div>
      </header>

      {/* Elegant Styled Search Box Row */}
      <div className="flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search items by name (press / to focus)" 
            className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-xl py-3 pl-11 pr-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#beb29c] focus:ring-1 focus:ring-[#beb29c] transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
          <button 
            onClick={() => setSearch('')}
            className="flex-1 md:flex-initial text-center bg-[#FCFBF9] border border-[#d8cdbc] hover:bg-[#F2EFE6] text-[11px] font-bold text-slate-800 px-4 py-3 rounded-xl transition-all active:scale-95"
          >
            Clear
          </button>
          <div className="flex-1 md:flex-initial text-center bg-[#EDE7DF] border border-[#ded5c6] text-[11px] font-bold text-slate-800 px-4 py-3 rounded-xl shadow-sm">
            {filteredProducts.length} items
          </div>
        </div>
      </div>

      {/* Crisp Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredProducts.map((item, idx) => {
          const displayImg = item.img || getFallbackImage(item.name);
          const itemReservations = reservations.filter(r => r.itemId === item.id && r.status === 'Packing');
          const reservedQty = itemReservations.reduce((acc, curr) => acc + (curr.qty || 0), 0);
          const availableQty = item.qty || 0;
          const onHandQty = availableQty + reservedQty;
          
          return (
            <motion.div 
              key={item.id ? `inv-card-${item.id}-${idx}` : `inv-card-idx-${idx}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(idx * 0.03, 0.4) }}
              className="bg-[#FCFBF9] border border-[#EBE3D5] rounded-[20px] shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden relative p-3"
            >
              {/* Image Section with Overlays */}
              <div className="h-44 bg-slate-50 relative rounded-[15px] border border-[#EEE6D8] group overflow-hidden">
                <img 
                  src={displayImg} 
                  alt={item.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                  referrerPolicy="no-referrer"
                />
                
                {/* Image Trigger Icon left top */}
                <div className="absolute top-2.5 left-2.5 bg-white/90 backdrop-blur border border-[#e2d7c5] p-1.5 rounded-lg shadow-sm">
                  <Camera className="w-3.5 h-3.5 text-slate-700" />
                </div>

                {/* Overlaid View Image Button right top */}
                <button 
                  onClick={() => setPreviewImage(displayImg)}
                  className="absolute top-2.5 right-2.5 bg-white/95 border border-[#e2d7c5] hover:bg-white text-[10px] text-slate-700 font-bold px-2.5 py-1 rounded-full shadow-sm transition-all"
                >
                  View Image
                </button>

                 {/* Bottom-right overlay Qty indicator */}
                <div className="absolute bottom-2.5 right-2.5 bg-slate-900/90 backdrop-blur rounded px-2.5 py-1 text-[10px] font-black tracking-tight text-white shadow-md flex flex-col items-end leading-none gap-0.5 border border-slate-700/50">
                  <div className="opacity-80">ON HAND: {onHandQty}</div>
                  {reservedQty > 0 && <div className="text-[9px] text-[#FBBF24] font-black">AVAIL: {availableQty}</div>}
                </div>
              </div>

              {/* Body Content Section */}
              <div className="px-1 py-3 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="text-[13px] font-bold text-[#1E293B] line-clamp-2 leading-tight">
                    {item.name}
                  </h3>
                </div>

                {/* Warehousing Locations Layout & Pill Styles matching user screenshot */}
                <div className="space-y-1.5 py-1">
                  {/* Old Warehouse */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 bg-[#F1EFE9] border border-[#E3DCD1] text-[10px] font-extrabold text-slate-600 px-3 py-0.5 rounded-full uppercase tracking-wider">
                      🏫 Old warehouse
                    </span>
                    <span className="text-xs font-black text-slate-800">{item.qtyOld || 0}</span>
                  </div>

                  {/* New Warehouse */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 bg-[#F1EFE9] border border-[#E3DCD1] text-[10px] font-extrabold text-slate-600 px-3 py-0.5 rounded-full uppercase tracking-wider">
                      🏫 New warehouse
                    </span>
                    <span className="text-xs font-black text-slate-800">{item.qtyNew || 0}</span>
                  </div>

                  {/* Office */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 bg-[#FEF3C7] border border-[#FDE68A] text-[10px] font-extrabold text-amber-800 px-3 py-0.5 rounded-full uppercase tracking-wider">
                      🏷️ Office
                    </span>
                    <span className="text-xs font-black text-slate-800">{item.qtyOffice || 0}</span>
                  </div>

                  {/* Reserved (Dedicated inventory card row display right below Office) */}
                  <div className="flex items-center justify-between bg-amber-50/20 border border-amber-100/50 rounded-xl px-1.5 py-0.5">
                    <span className="flex items-center gap-1 bg-amber-50 border border-amber-200/60 text-[10.5px] font-extrabold text-amber-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      🔖 Reserved
                    </span>
                    <span className={cn(
                      "text-xs font-black",
                      reservedQty > 0 ? "text-amber-600 font-extrabold" : "text-slate-400 font-medium"
                    )}>
                      {reservedQty || 0}
                    </span>
                  </div>
                </div>

                {/* Subtext and Goal */}
                <div className="text-[10.5px] text-[#8C8273] font-bold tracking-wide flex flex-col gap-0.5">
                  <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded-lg text-slate-700">
                    <span className={cn(
                      reservedQty > 0 ? "text-amber-800 font-extrabold" : "text-slate-700"
                    )}>Available: {availableQty} units</span>
                    <span>Goal: {item.goal || 0}</span>
                  </div>
                </div>

                {/* Controls Bar - Centered round action keys */}
                <div className="pt-2 border-t border-[#F2EDE2] flex items-center gap-1.5">
                  {/* Plus */}
                  <button 
                    onClick={() => { setAdjustModal({ open: true, item, mode: 'add' }); setAdjLocation('Old warehouse'); }}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-[#F1EFE9] hover:text-slate-900 flex items-center justify-center transition-all hover:scale-105 active:scale-90 shadow-sm"
                    title="Add inventory"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5px]" />
                  </button>
                  {/* Minus */}
                  <button 
                    onClick={() => { setAdjustModal({ open: true, item, mode: 'sub' }); setAdjLocation('Old warehouse'); }}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-[#F1EFE9] hover:text-slate-900 flex items-center justify-center transition-all hover:scale-105 active:scale-90 shadow-sm"
                    title="Deduct inventory"
                  >
                    <Minus className="w-3.5 h-3.5 stroke-[2.5px]" />
                  </button>
                  {/* Hold Stock / Reserve */}
                  <button 
                    onClick={() => {
                      setHoldModal({ open: true, item });
                      setHoldClientName('');
                      setHoldQty('1');
                      setHoldRemarks('');
                      setHoldLocation('Old warehouse');
                      setHoldOrderId(`ORD-${Math.floor(Math.random() * 89990) + 10000}`);
                    }}
                    className="w-9 h-9 rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100/95 hover:text-amber-800 flex items-center justify-center transition-all hover:scale-105 active:scale-90 shadow-sm"
                    title="Reserve / Hold Stock"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                  </button>
                  {/* Edit */}
                  <button 
                    onClick={() => { setRenameModal({ open: true, item }); setNewName(item.name); }}
                    className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-[#F1EFE9] hover:text-slate-900 flex items-center justify-center transition-all hover:scale-105 active:scale-90 shadow-sm"
                    title="Edit label"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {/* Delete */}
                  <button 
                    onClick={() => setDeleteModal({ open: true, item })}
                    className="w-9 h-9 rounded-full border border-rose-100 bg-white text-rose-450 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-all hover:scale-105 active:scale-90 shadow-sm ml-auto"
                    title="Purge SKU"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Adjust Modal Dialog */}
      <AnimatePresence>
        {adjustModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAdjustModal({ ...adjustModal, open: false })} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#EEE6D8] overflow-hidden">
              <div className="p-4 border-b border-[#F2EDE2] flex items-center justify-between bg-[#FAF8F5]">
                <h3 className="font-bold text-slate-850 text-xs uppercase tracking-widest">{adjustModal.mode === 'add' ? 'Increase' : 'Decrease'} Level Stock</h3>
                <button onClick={() => setAdjustModal({ ...adjustModal, open: false })} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-[#FAF8F5] p-3 rounded-xl text-center border border-[#EDE7DF]">
                   <p className="text-[10px] text-[#8C8273] font-bold uppercase tracking-widest">Active SKU</p>
                   <p className="text-xs font-bold text-slate-850 mt-1 uppercase">{adjustModal.item.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Quantity change</label>
                    <input type="number" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#beb29c]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Warehouse Level Unit</label>
                    <select value={adjLocation} onChange={e => setAdjLocation(e.target.value)} className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-bold outline-none cursor-pointer">
                      <option>Old warehouse</option>
                      <option>New warehouse</option>
                      <option>Office</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Comment Purpose</label>
                    <input value={adjPurpose} onChange={e => setAdjPurpose(e.target.value)} placeholder="e.g. Regular Stock Audit" className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs outline-none focus:border-[#beb29c]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Operator Identity</label>
                    <input value={adjTakenBy} onChange={e => setAdjTakenBy(e.target.value)} placeholder="Enter full name" className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs outline-none focus:border-[#beb29c]" />
                  </div>
                </div>
                <button onClick={handleAdjust} className="w-full py-3 bg-[#1E293B] text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-slate-800 active:scale-95 shadow">Commit Stock Update</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Rename Modal */}
        {renameModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRenameModal({ ...renameModal, open: false })} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[#EEE6D8]">
              <div className="p-4 border-b border-[#F2EDE2] font-bold text-slate-850 text-[10px] uppercase tracking-widest bg-[#FAF8F5]">Rename Item Designation</div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-semibold">New Designation</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-3 text-xs font-bold outline-none focus:border-[#beb29c]" />
                </div>
                <button onClick={handleRename} className="w-full py-3 bg-[#1E293B] text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-slate-800">Confirm Change</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Modal */}
        {deleteModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteModal({ ...deleteModal, open: false })} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-rose-100">
              <div className="p-8 text-center space-y-5">
                <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100">
                   <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                   <h3 className="font-bold text-slate-850 text-sm">Purge SKU structure?</h3>
                   <p className="text-[10px] text-slate-400 mt-2 leading-relaxed uppercase tracking-wider">This operation is irreversible. All current stock magnitudes for <span className="text-slate-800 font-bold">"{deleteModal.item.name}"</span> will be permanently erased.</p>
                </div>
                <div className="flex gap-2.5 pt-2">
                   <button onClick={() => setDeleteModal({ ...deleteModal, open: false })} className="flex-1 py-2.5 text-[10px] font-bold text-slate-400 uppercase border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
                   <button onClick={handleDelete} className="flex-1 py-2.5 text-[10px] font-bold text-white bg-rose-500 uppercase rounded-xl hover:bg-rose-600 transition-all">Confirm Delete</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Photo preview overlay */}
        {previewImage && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreviewImage(null)} className="absolute inset-0 bg-slate-950/80" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative max-w-2xl max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl z-10">
              <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 bg-black/60 hover:bg-black text-white p-2 rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
              <img src={previewImage} alt="Preview" className="max-w-full max-h-[80vh] object-contain block" referrerPolicy="no-referrer" />
            </motion.div>
          </div>
        )}

        {/* Hold Stock / Create Reservation Modal */}
        {holdModal.open && holdModal.item && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setHoldModal({ open: false, item: null })} 
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#EEE6D8] overflow-hidden z-10"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-[#F2EDE2] flex items-center justify-between bg-[#FAF8F5]">
                <h3 className="font-bold text-[#1E293B] text-[11px] uppercase tracking-widest flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-amber-600 fill-amber-50" />
                  <span>Reserve / Hold Item Stock</span>
                </h3>
                <button 
                  onClick={() => setHoldModal({ open: false, item: null })} 
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <div className="p-6 space-y-4">
                <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#EDE7DF]">
                  <p className="text-[9px] text-[#8C8273] font-bold uppercase tracking-wider">Item Designation</p>
                  <p className="text-xs font-black text-slate-800 mt-1 uppercase">{holdModal.item.name}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500 font-bold">
                    <span>On Hand: {holdModal.item.qty || 0}</span>
                    <span>•</span>
                    <span className="text-amber-700 font-black">Reserved: {reservations.filter(r => r.itemId === holdModal.item.id && r.status === 'Packing').reduce((acc, curr) => acc + (curr.qty || 0), 0)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Order ID */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-black">Order / Hold ID</label>
                    <input 
                      type="text" 
                      value={holdOrderId} 
                      onChange={e => setHoldOrderId(e.target.value)} 
                      placeholder="e.g. ORD-10022" 
                      className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-bold outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  {/* Quantity to Hold */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-black">Quantity to Hold</label>
                    <input 
                      type="number" 
                      value={holdQty} 
                      onChange={e => setHoldQty(e.target.value)} 
                      min="1" 
                      className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-bold outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Deduct Stock From Location Selector */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-black">Hold Stock From Location</label>
                  <select 
                    value={holdLocation} 
                    onChange={e => setHoldLocation(e.target.value)}
                    className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-bold outline-none cursor-pointer focus:border-amber-500 transition-colors"
                  >
                    <option value="Old warehouse">Old warehouse (Available: {holdModal.item.qtyOld || 0})</option>
                    <option value="New warehouse">New warehouse (Available: {holdModal.item.qtyNew || 0})</option>
                    <option value="Office">Office (Available: {holdModal.item.qtyOffice || 0})</option>
                  </select>
                </div>

                {/* Client Organization Name */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-black">Client Name / School Entity</label>
                  <input 
                    type="text" 
                    value={holdClientName} 
                    onChange={e => setHoldClientName(e.target.value)} 
                    placeholder="e.g. Marlon Tech Academy" 
                    className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-bold outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                {/* Remarks / Hold Purpose */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-black">Remarks / Hold Purpose</label>
                  <textarea 
                    value={holdRemarks} 
                    onChange={e => setHoldRemarks(e.target.value)} 
                    placeholder="e.g. STEM Robotics trial batch hold" 
                    rows={2}
                    className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-semibold outline-none focus:border-amber-500 resize-none transition-colors"
                  />
                </div>

                {/* Cancel and Confirm buttons row */}
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setHoldModal({ open: false, item: null });
                      setHoldClientName('');
                      setHoldQty('1');
                      setHoldRemarks('');
                      setHoldOrderId('');
                    }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={handleCreateHold} 
                    className="flex-1 py-3 bg-[#1E293B] text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-slate-800 active:scale-[0.98] shadow-md flex items-center justify-center gap-1.5"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    <span>Confirm Hold</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Premium Elegant Floating Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className={cn(
                "fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-[10px] font-bold uppercase tracking-wide",
                toast.type === 'warn' ? "bg-amber-50 border-amber-200 text-amber-800" :
                toast.type === 'error' ? "bg-rose-50 border-rose-200 text-rose-800" :
                "bg-emerald-50 border-emerald-200 text-emerald-800"
              )}
            >
              <span className="w-2 h-2 rounded-full animate-ping shrink-0 bg-current" />
              <span>{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </div>
  );
}
