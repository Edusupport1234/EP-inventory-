import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Edit3, Trash2, X, AlertTriangle, Calendar, ShoppingBag, 
  MapPin, Clipboard, Check, HelpCircle, FileText, Package 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, setDoc,
  serverTimestamp, deleteDoc, handleFirestoreError, OperationType, auth, 
  rtdb, ref, onValue, set, update, remove 
} from '@/src/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface StatusRecord {
  id: string;
  ts?: any;
  order: string;
  item: string;
  qty: number;
  status: 'Loan' | 'Rent' | 'Reserve';
  where: 'Client' | 'On the way back' | 'Office' | string;
  remarks?: string;
  actor?: string;
  editor?: string;
  updatedAt?: any;
}

export default function Status() {
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<StatusRecord[]>([]);
  const [user, setUser] = useState(auth.currentUser);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [order, setOrder] = useState('');
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('1');
  const [statusType, setStatusType] = useState<'Loan' | 'Rent' | 'Reserve'>('Loan');
  const [where, setWhere] = useState('Client');
  const [remarks, setRemarks] = useState('');

  // Input ref for focus
  const orderInputRef = useRef<HTMLInputElement>(null);

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warn' | 'error' } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Synced inventory database objects to support "Reserve" reductions and list lookup
  const [products, setProducts] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  // Tracking original record prior to edit to correctly manage delta reversion on inventory
  const [originalRecord, setOriginalRecord] = useState<StatusRecord | null>(null);

  // Sync inventory levels in real-time from Firebase (Firestore + RTDB)
  useEffect(() => {
    let firestoreItems: any[] = [];
    let rtdbItems: any[] = [];

    const handleMergeInv = () => {
      const mergedMap = new Map<string, any>();
      rtdbItems.forEach(item => mergedMap.set(item.id, item));
      firestoreItems.forEach(item => mergedMap.set(item.id, item));
      setProducts(Array.from(mergedMap.values()));
    };

    const q = query(collection(db, 'inventory'));
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      firestoreItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMergeInv();
    }, (error) => {
      console.warn("Could not load Firestore inventory in Status view.", error);
    });

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
        handleMergeInv();
      }, (err) => {
        console.warn("Could not load RTDB inventory in Status view.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB inventory subscription failed in Status: ", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  // Sync reservations in real-time from Firebase (Firestore + RTDB)
  useEffect(() => {
    let firestoreRecords: any[] = [];
    let rtdbRecords: any[] = [];

    const handleMergeRes = () => {
      const mergedMap = new Map<string, any>();
      rtdbRecords.forEach(record => mergedMap.set(record.id, record));
      firestoreRecords.forEach(record => mergedMap.set(record.id, record));
      setReservations(Array.from(mergedMap.values()));
    };

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
          location: data.location || 'Old warehouse',
          remarks: data.remarks || '',
          actor: data.actor || '',
          ts: data.ts
        };
      });
      handleMergeRes();
    }, (error) => {
      console.warn("Could not load Firestore reservations in Status view.", error);
    });

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
              location: value.location || 'Old warehouse',
              remarks: value.remarks || '',
              actor: value.actor || '',
              ts: value.ts || 0
            };
          });
        } else {
          rtdbRecords = [];
        }
        handleMergeRes();
      }, (err) => {
        console.warn("Could not load RTDB reservations in Status view.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB reservations subscription failed in Status view: ", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  const showToast = (message: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // Dual loading from Firestore and RTDB
  useEffect(() => {
    let firestoreStatuses: StatusRecord[] = [];
    let rtdbStatuses: StatusRecord[] = [];

    const handleMerge = () => {
      const mergedMap = new Map<string, StatusRecord>();
      
      // Load RTDB records first
      rtdbStatuses.forEach(record => mergedMap.set(record.id, record));
      
      // Firestore records next (prioritized if duplicate)
      firestoreStatuses.forEach(record => mergedMap.set(record.id, record));

      // Sort by timestamp desc or fallback ID order
      const sorted = Array.from(mergedMap.values()).sort((a, b) => {
        const timeA = a.ts?.toDate ? a.ts.toDate().getTime() : (a.ts ? new Date(a.ts).getTime() : 0);
        const timeB = b.ts?.toDate ? b.ts.toDate().getTime() : (b.ts ? new Date(b.ts).getTime() : 0);
        return timeB - timeA;
      });

      setStatuses(sorted);
    };

    // 1. Firestore subscriber
    const q = query(collection(db, 'statuses'));
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      firestoreStatuses = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as StatusRecord));
      handleMerge();
    }, (error) => {
      console.warn("Firestore statuses loaded with error/denied.", error);
    });

    // 2. Realtime Database subscriber
    let unsubscribeRtdb = () => {};
    try {
      const rtdbRef = ref(rtdb, 'statuses');
      const rtdbUnsub = onValue(rtdbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          rtdbStatuses = Object.entries(data).map(([key, value]: [string, any]) => {
            return {
              id: key,
              ...value,
              order: value.order || 'Unknown Order',
              item: value.item || 'Unnamed Item',
              qty: Number(value.qty ?? value.quantity ?? 1),
              status: value.status || 'Loan',
              where: value.where || 'Client',
              remarks: value.remarks || '',
              actor: value.actor || '',
              ts: value.ts || 0
            } as StatusRecord;
          });
        } else {
          rtdbStatuses = [];
        }
        handleMerge();
      }, (err) => {
        console.warn("RTDB statuses loading error/ignored.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB statuses subscriber initialization failed:", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  const openNewModal = () => {
    setEditingId(null);
    setOriginalRecord(null);
    setOrder('');
    setItem('');
    setQty('1');
    setStatusType('Loan');
    setWhere('Client');
    setRemarks('');
    setIsModalOpen(true);
    // Focus order input
    setTimeout(() => orderInputRef.current?.focus(), 150);
  };

  const openEditModal = (record: StatusRecord) => {
    setEditingId(record.id);
    setOriginalRecord({ ...record });
    setOrder(record.order);
    setItem(record.item);
    setQty(String(record.qty));
    setStatusType(record.status);
    setWhere(record.where);
    setRemarks(record.remarks || '');
    setIsModalOpen(true);
    setTimeout(() => orderInputRef.current?.focus(), 150);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const orderStr = order.trim();
    const itemStr = item.trim();
    const qtyNum = parseInt(qty, 10);

    if (!orderStr || !itemStr || isNaN(qtyNum) || qtyNum <= 0) {
      showToast('Please fill Order ID, Item Name, and a positive Quantity.', 'warn');
      return;
    }

    const actor = user?.email || 'Unknown';
    const fieldMap: any = { 
      'Old warehouse': 'qtyOld', 
      'New warehouse': 'qtyNew', 
      'Office': 'qtyOffice' 
    };

    try {
      if (editingId) {
        // Edit flow

        // 1. Revert original stock if it was of type 'Reserve'
        if (originalRecord && originalRecord.status === 'Reserve') {
          const oldProduct = products.find(p => p.name.toLowerCase() === originalRecord.item.toLowerCase());
          if (oldProduct) {
            const oldField = fieldMap[originalRecord.where] || 'qtyOld';
            const restoredLocQty = (oldProduct[oldField] || 0) + originalRecord.qty;
            const restoredTotalQty = (oldProduct.qty || 0) + originalRecord.qty;

            try {
              await updateDoc(doc(db, 'inventory', oldProduct.id), {
                [oldField]: restoredLocQty,
                qty: restoredTotalQty
              });
              await update(ref(rtdb, `inventory/${oldProduct.id}`), {
                [oldField]: restoredLocQty,
                qty: restoredTotalQty
              });
            } catch (err_restore) {
              console.warn("Status Edit: Reverting old stock failed:", err_restore);
            }
          }

          // Delete accompanying reservation
          try {
            await deleteDoc(doc(db, 'reservations', editingId));
            await remove(ref(rtdb, `reservations/${editingId}`));
          } catch (err_res_del) {
            console.warn("Status Edit: Deleting original reservation failed:", err_res_del);
          }
        }

        // 2. Deduct new stock if the updated type is 'Reserve'
        if (statusType === 'Reserve') {
          const newProduct = products.find(p => p.name.toLowerCase() === itemStr.toLowerCase());
          if (newProduct) {
            const newField = fieldMap[where] || 'qtyOld';
            
            // Avoid using stale state values during sequential calculations by adjusting local readings
            let tempLocQty = newProduct[newField] || 0;
            let tempTotalQty = newProduct.qty || 0;

            const oldProductOfSameName = originalRecord && products.find(p => p.name.toLowerCase() === originalRecord.item.toLowerCase());
            if (originalRecord && originalRecord.status === 'Reserve' && oldProductOfSameName && oldProductOfSameName.id === newProduct.id) {
              const oldField = fieldMap[originalRecord.where] || 'qtyOld';
              if (oldField === newField) {
                tempLocQty += originalRecord.qty;
              }
              tempTotalQty += originalRecord.qty;
            }

            const finalLocQty = Math.max(0, tempLocQty - qtyNum);
            const finalTotalQty = Math.max(0, tempTotalQty - qtyNum);

            try {
              await updateDoc(doc(db, 'inventory', newProduct.id), {
                [newField]: finalLocQty,
                qty: finalTotalQty
              });
              await update(ref(rtdb, `inventory/${newProduct.id}`), {
                [newField]: finalLocQty,
                qty: finalTotalQty
              });
            } catch (err_deduct) {
              console.warn("Status Edit: Deducting new stock failed:", err_deduct);
            }

            // Create/update matching reservation document
            const reservationFirestore = {
              orderId: orderStr.toUpperCase(),
              clientName: 'Status Reserve',
              itemId: newProduct.id,
              itemName: newProduct.name,
              qty: qtyNum,
              rackId: '',
              rackLevel: -1,
              status: 'Packing',
              remarks: remarks.trim() ? `[Status Reserve] ${remarks.trim()}` : '[Status Reserve] Reserved from status card',
              location: where,
              actor: actor,
              ts: serverTimestamp()
            };

            const reservationRtdb = {
              orderId: orderStr.toUpperCase(),
              clientName: 'Status Reserve',
              itemId: newProduct.id,
              itemName: newProduct.name,
              qty: qtyNum,
              rackId: '',
              rackLevel: -1,
              status: 'Packing',
              remarks: remarks.trim() ? `[Status Reserve] ${remarks.trim()}` : '[Status Reserve] Reserved from status card',
              location: where,
              actor: actor,
              ts: Date.now()
            };

            try {
              await setDoc(doc(db, 'reservations', editingId), reservationFirestore);
              await set(ref(rtdb, `reservations/${editingId}`), reservationRtdb);
            } catch (err_res_create) {
              console.warn("Status Edit: Creating reservation document failed:", err_res_create);
            }
          }
        }

        // 3. Save Status record
        const updateDataFirestore = {
          order: orderStr,
          item: itemStr,
          qty: qtyNum,
          status: statusType,
          where,
          remarks,
          editor: actor,
          updatedAt: serverTimestamp()
        };

        const updateDataRtdb = {
          order: orderStr,
          item: itemStr,
          qty: qtyNum,
          status: statusType,
          where,
          remarks,
          editor: actor,
          updatedAt: Date.now()
        };

        await updateDoc(doc(db, 'statuses', editingId), updateDataFirestore);
        try {
          await update(ref(rtdb, `statuses/${editingId}`), updateDataRtdb);
        } catch (e) {}

        showToast('Status record updated successfully');
      } else {
        // Create flow
        const targetId = doc(collection(db, 'statuses')).id;

        // 1. If status type is 'Reserve', deduct inventory stock and register a reservation
        if (statusType === 'Reserve') {
          const matchingProduct = products.find(p => p.name.toLowerCase() === itemStr.toLowerCase());
          if (matchingProduct) {
            const field = fieldMap[where] || 'qtyOld';
            const currentLocQty = matchingProduct[field] || 0;
            const newLocQty = Math.max(0, currentLocQty - qtyNum);
            const newTotalQty = Math.max(0, (matchingProduct.qty || 0) - qtyNum);

            try {
              await updateDoc(doc(db, 'inventory', matchingProduct.id), {
                [field]: newLocQty,
                qty: newTotalQty
              });
              await update(ref(rtdb, `inventory/${matchingProduct.id}`), {
                [field]: newLocQty,
                qty: newTotalQty
              });
            } catch (err_deduct) {
              console.warn("Status Create: Deducting stock failed:", err_deduct);
            }

            // Also register a reservation
            const reservationFirestore = {
              orderId: orderStr.toUpperCase(),
              clientName: 'Status Reserve',
              itemId: matchingProduct.id,
              itemName: matchingProduct.name,
              qty: qtyNum,
              rackId: '',
              rackLevel: -1,
              status: 'Packing',
              remarks: remarks.trim() ? `[Status Reserve] ${remarks.trim()}` : '[Status Reserve] Reserved from status',
              location: where,
              actor: actor,
              ts: serverTimestamp()
            };

            const reservationRtdb = {
              orderId: orderStr.toUpperCase(),
              clientName: 'Status Reserve',
              itemId: matchingProduct.id,
              itemName: matchingProduct.name,
              qty: qtyNum,
              rackId: '',
              rackLevel: -1,
              status: 'Packing',
              remarks: remarks.trim() ? `[Status Reserve] ${remarks.trim()}` : '[Status Reserve] Reserved from status',
              location: where,
              actor: actor,
              ts: Date.now()
            };

            try {
              await setDoc(doc(db, 'reservations', targetId), reservationFirestore);
              await set(ref(rtdb, `reservations/${targetId}`), reservationRtdb);
            } catch (err_res_create) {
              console.warn("Status Create: Registering reservation failed:", err_res_create);
            }
          }
        }
        
        // 2. Create the Status Record
        const createDataFire = {
          order: orderStr,
          item: itemStr,
          qty: qtyNum,
          status: statusType,
          where,
          remarks,
          actor,
          ts: serverTimestamp()
        };

        const createDataRtdb = {
          order: orderStr,
          item: itemStr,
          qty: qtyNum,
          status: statusType,
          where,
          remarks,
          actor,
          ts: Date.now()
        };

        // Create in Firestore
        await updateDoc(doc(db, 'statuses', targetId), createDataFire).catch(async () => {
          // Fallback if not existent
          await setDoc(doc(db, 'statuses', targetId), createDataFire);
        });

        // Create in RTDB
        try {
          await set(ref(rtdb, `statuses/${targetId}`), createDataRtdb);
        } catch (e) {}

        showToast('New status record created successfully');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Error saving status record', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    // Revert inventory stock if this were a reserve record
    const record = statuses.find(s => s.id === id);
    if (record && record.status === 'Reserve') {
      const matchingProduct = products.find(p => p.name.toLowerCase() === record.item.toLowerCase());
      if (matchingProduct) {
        const fieldMap: any = { 
          'Old warehouse': 'qtyOld', 
          'New warehouse': 'qtyNew', 
          'Office': 'qtyOffice' 
        };
        const field = fieldMap[record.where] || 'qtyOld';
        const currentLocQty = matchingProduct[field] || 0;
        const restoredLocQty = currentLocQty + record.qty;
        const restoredTotalQty = (matchingProduct.qty || 0) + record.qty;

        try {
          // Revert Firestore
          await updateDoc(doc(db, 'inventory', matchingProduct.id), {
            [field]: restoredLocQty,
            qty: restoredTotalQty
          });
          // Revert RTDB
          await update(ref(rtdb, `inventory/${matchingProduct.id}`), {
            [field]: restoredLocQty,
            qty: restoredTotalQty
          });
        } catch (err_revert) {
          console.warn("Status Delete: Reverting stock failed:", err_revert);
        }
      }

      // Delete corresponding reservation
      try {
        await deleteDoc(doc(db, 'reservations', id));
        await remove(ref(rtdb, `reservations/${id}`));
      } catch (err_res_del) {
        console.warn("Status Delete: Deleting reservation failed:", err_res_del);
      }
    }

    try {
      await deleteDoc(doc(db, 'statuses', id));
      try {
        await remove(ref(rtdb, `statuses/${id}`));
      } catch (e) {}
      showToast('Status record deleted successfully');
    } catch (error) {
      console.error(error);
      showToast('Error deleting status record', 'error');
    }
  };

  const filteredStatuses = statuses.filter(s => {
    const q = search.toLowerCase();
    return (
      (s.order || '').toLowerCase().includes(q) ||
      (s.item || '').toLowerCase().includes(q) ||
      (s.remarks || '').toLowerCase().includes(q) ||
      (s.where || '').toLowerCase().includes(q) ||
      (s.status || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50/50 -m-6 p-6 space-y-6 pb-24">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold ${
              toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
              toast.type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700' :
              'bg-[#F2EFE6] border-[#D6CDBC] text-slate-800'
            }`}
          >
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75 font-extrabold text-[14px]">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Status Tracker</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">Track and coordinate individual loan and rent sets instantly across operations.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] uppercase tracking-wider px-5 py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Record</span>
        </button>
      </header>

      {/* Main Grid Wrapper with Live Stock Panel on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        {/* Main Records Section */}
        <div className="xl:col-span-3 space-y-6">
          {/* Styled Search Block */}
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search order ID, item name, remarks, or location..." 
                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
              <button 
                onClick={() => setSearch('')}
                className="flex-1 md:flex-initial text-center bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-700 px-4 py-3 rounded-xl transition-all"
              >
                Clear
              </button>
              <div className="flex-1 md:flex-initial text-center bg-slate-100 border border-slate-200 text-[11px] font-extrabold text-slate-700 px-4 py-3 rounded-xl shadow-sm leading-none flex items-center justify-center">
                {filteredStatuses.length} records
              </div>
            </div>
          </div>

          {/* Main Grid List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStatuses.map((record, idx) => {
              const timestamp = record.ts?.toDate ? record.ts.toDate() : (record.ts ? new Date(record.ts) : null);
              const dateString = timestamp ? timestamp.toLocaleString() : 'Just now';
              
              return (
                <motion.div
                  layout
                  key={record.id ? `status-card-${record.id}-${idx}` : `status-card-idx-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{dateString}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                          record.status === 'Rent' 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200/55' 
                            : record.status === 'Reserve'
                            ? 'bg-purple-105 text-purple-800 border border-purple-200/55'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200/55'
                        }`}>
                          {record.status}
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                          {record.where || 'Client'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block">Order ref</span>
                        <h3 className="text-sm font-black text-slate-700 tracking-tight leading-tight mt-0.5">{record.order}</h3>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block">Item</span>
                          <span className="text-xs font-bold text-slate-600 block truncate mt-0.5" title={record.item}>{record.item}</span>
                        </div>
                        <div>
                          <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block">Quantity</span>
                          <span className="text-xs font-black text-slate-800 block mt-0.5">{record.qty} units</span>
                        </div>
                      </div>

                      {record.remarks && (
                        <div className="bg-amber-50/20 px-3 py-2.5 rounded-xl border border-amber-100/50">
                          <span className="text-[8px] font-extrabold text-amber-700 uppercase tracking-widest block">Operational Notes</span>
                          <p className="text-[11px] font-medium text-slate-600 leading-normal mt-0.5">{record.remarks}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2.5 mt-5 pt-3 border-t border-slate-100 justify-end">
                    <button 
                      onClick={() => openEditModal(record)}
                      className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all active:scale-95"
                      title="Edit Status"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {deleteConfirmId === record.id ? (
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => {
                            handleDelete(record.id);
                            setDeleteConfirmId(null);
                          }}
                          className="px-2.5 py-1.5 bg-red-600 border border-red-600 rounded-lg text-white font-black text-[9px] uppercase tracking-wider hover:bg-red-700 active:scale-95 transition-all shadow-sm"
                          title="Click again to confirm deletion"
                        >
                          Confirm
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 text-[9px] font-bold uppercase hover:bg-slate-200 active:scale-95 transition-all"
                          title="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setDeleteConfirmId(record.id)}
                        className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all active:scale-95"
                        title="Delete Status"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {statuses.length === 0 && (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl border-dashed">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Clipboard className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">No status records tracked yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">Click "+ New Record" to record and track high-value sets currently loaned, rented or reserved.</p>
            </div>
          )}
        </div>

        {/* Dynamic Database Stock Metrics Sidebar */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm sticky top-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-teal-600" />
                <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">Firebase Console Live Items</h2>
              </div>
              <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-250 font-black px-2 py-0.5 rounded-full uppercase shrink-0">
                Live
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-normal mb-4">
              Stock levels directly from the console database. Under the <strong>Reserved status</strong> of an item, it holds stock, decrementing the available warehouse count instantly.
            </p>

            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {products.map((itemObj, idx) => {
                const itemRes = reservations.filter(r => r.itemId === itemObj.id && r.status === 'Packing');
                const reservedQty = itemRes.reduce((acc, curr) => acc + (curr.qty || 0), 0);
                const availableQty = itemObj.qty || 0;
                const totalOnHand = availableQty + reservedQty;

                return (
                  <div key={itemObj.id ? `live-prod-${itemObj.id}-${idx}` : `live-prod-idx-${idx}`} className="p-3 bg-slate-50 border border-slate-100 rounded-xl transition-all hover:border-slate-300">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-xs font-extrabold text-slate-700 truncate block max-w-[80%]" title={itemObj.name}>
                        {itemObj.name}
                      </h3>
                      <span className="text-[8px] font-mono font-bold bg-slate-200 text-slate-500 px-1 rounded truncate">
                        ID: {itemObj.id?.substring(0, 4)}...
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-100/70 text-center">
                      <div className="bg-emerald-50/40 p-1.5 rounded-lg border border-emerald-100/50">
                        <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Warehouse Only</span>
                        <span className="text-xs font-black text-slate-700">{availableQty}</span>
                      </div>
                      <div className="bg-amber-50/45 p-1.5 rounded-lg border border-amber-105-dec border-amber-100/50">
                        <span className="text-[7.5px] font-black text-amber-600/70 uppercase tracking-wider block">Reserved</span>
                        <span className={`text-xs font-black ${reservedQty > 0 ? "text-amber-600" : "text-slate-400"}`}>
                          {reservedQty}
                        </span>
                      </div>
                      <div className="bg-indigo-50/40 p-1.5 rounded-lg border border-indigo-100/50">
                        <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-wider block">Total Stock</span>
                        <span className="text-xs font-black text-indigo-950 font-mono">{totalOnHand}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {products.length === 0 && (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Loading products from Firebase...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Styled Dialog Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/35 backdrop-blur-xs" 
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl max-w-md w-full relative z-10 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{editingId ? 'Edit Status Record' : 'Add Status Record'}</h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-3.5">
                <div>
                  <label htmlFor="st-order" className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Order ID</label>
                  <input 
                    id="st-order"
                    ref={orderInputRef}
                    type="text" 
                    placeholder="e.g., ORDER 543" 
                    value={order}
                    onChange={(e) => setOrder(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-teal-500 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="st-item-select" className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Item Name</label>
                  <select 
                    id="st-item-select"
                    value={products.some(p => p.name.toLowerCase() === item.toLowerCase()) ? products.find(p => p.name.toLowerCase() === item.toLowerCase())?.name : (item === '' ? '' : 'custom')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setItem('');
                      } else {
                        setItem(val);
                      }
                    }}
                    className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-teal-500 transition-all mb-2 shadow-sm"
                  >
                    <option value="">-- Choose Synced Firebase Product --</option>
                    {products.map((p, idx) => (
                      <option key={p.id ? `select-prod-${p.id}-${idx}` : `select-prod-idx-${idx}`} value={p.name}>
                        {p.name} (Avail: {p.qty || 0})
                      </option>
                    ))}
                    <option value="custom">✍️ Custom/New Item...</option>
                  </select>

                  {/* If they choose custom or typed value that is not in synced product list */}
                  {(!products.some(p => p.name.toLowerCase() === item.toLowerCase()) || item === '' || !products.map(p => p.name).includes(item)) && (
                    <input 
                      id="st-item"
                      type="text" 
                      placeholder="Type custom item name..." 
                      value={item}
                      onChange={(e) => setItem(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-teal-500 transition-all animate-in slide-in-from-top-1 duration-150"
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="st-qty" className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Quantity</label>
                  <input 
                    id="st-qty"
                    type="number" 
                    min="1"
                    step="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-teal-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="st-type" className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Type</label>
                    <select 
                      id="st-type"
                      value={statusType}
                      onChange={(e) => setStatusType(e.target.value as 'Loan' | 'Rent' | 'Reserve')}
                      className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-teal-500 transition-all"
                    >
                      <option value="Loan">Loan</option>
                      <option value="Rent">Rent</option>
                      <option value="Reserve">Reserve</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="st-where" className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Location / Warehouse Source</label>
                    <select 
                      id="st-where"
                      value={where}
                      onChange={(e) => setWhere(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-teal-500 transition-all"
                    >
                      <option value="Client">Client</option>
                      <option value="On the way back">On the way back</option>
                      <option value="Office">Office</option>
                      <option value="Old warehouse">Old warehouse</option>
                      <option value="New warehouse">New warehouse</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="st-remarks" className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Remarks</label>
                  <textarea 
                    id="st-remarks"
                    rows={2} 
                    placeholder="Optional notes..." 
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-teal-500 transition-all resize-none"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-400 uppercase tracking-wider hover:bg-slate-50 active:scale-95 transition-all text-center"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white border border-teal-600 rounded-xl text-xs font-bold uppercase tracking-wider active:scale-95 transition-all text-center"
                  >
                    Save Record
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
