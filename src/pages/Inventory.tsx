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
  const [statuses, setStatuses] = useState<any[]>([]);
  const [user, setUser] = useState(auth.currentUser);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modal States
  const [adjustModal, setAdjustModal] = useState<{ open: boolean, item: any, mode: 'add' | 'sub' }>({ open: false, item: null, mode: 'add' });
  const [renameModal, setRenameModal] = useState<{ open: boolean, item: any }>({ open: false, item: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean, item: any }>({ open: false, item: null });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Camera image address prompt states
  const [isImagePromptOpen, setIsImagePromptOpen] = useState(false);
  const [editingImageItem, setEditingImageItem] = useState<any | null>(null);
  const [newImageLink, setNewImageLink] = useState('');

  // Form Inputs
  const [adjAmount, setAdjAmount] = useState('1');
  const [adjLocation, setAdjLocation] = useState('Old warehouse');
  const [adjPurpose, setAdjPurpose] = useState('');
  const [adjTakenBy, setAdjTakenBy] = useState('');
  const [newName, setNewName] = useState('');

  // Create Brand New Item State
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [saveSuccessDetails, setSaveSuccessDetails] = useState<{ name: string; qty: number } | null>(null);
  const [newItemDetails, setNewItemDetails] = useState({
    name: '',
    qtyOld: '0',
    qtyNew: '0',
    qtyOffice: '0',
    goal: '5',
    barcode: '',
    imgUrl: ''
  });
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

  // Fetch statuses in real-time (Dual-Sync Firestore & RTDB)
  useEffect(() => {
    let firestoreRecords: any[] = [];
    let rtdbRecords: any[] = [];

    const handleMergeStatuses = () => {
      const mergedMap = new Map<string, any>();
      rtdbRecords.forEach(record => mergedMap.set(record.id, record));
      firestoreRecords.forEach(record => mergedMap.set(record.id, record));
      setStatuses(Array.from(mergedMap.values()));
    };

    // 1. Firestore subscriber
    const q = query(collection(db, 'statuses'));
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      firestoreRecords = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          order: data.order || 'Unknown Order',
          item: data.item || 'Unnamed Item',
          qty: Number(data.qty ?? 1),
          status: data.status || 'Loan',
          where: data.where || 'Client',
          remarks: data.remarks || '',
          actor: data.actor || '',
          ts: data.ts
        };
      });
      handleMergeStatuses();
    }, (error) => {
      console.warn("Could not load Firestore statuses in Inventory view.", error);
    });

    // 2. RTDB subscriber
    let unsubscribeRtdb = () => {};
    try {
      const rtdbRef = ref(rtdb, 'statuses');
      const rtdbUnsub = onValue(rtdbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          rtdbRecords = Object.entries(data).map(([key, value]: [string, any]) => {
            return {
              id: key,
              order: value.order || 'Unknown Order',
              item: value.item || 'Unnamed Item',
              qty: Number(value.qty ?? value.quantity ?? 1),
              status: value.status || 'Loan',
              where: value.where || 'Client',
              remarks: value.remarks || '',
              actor: value.actor || '',
              ts: value.ts || 0
            };
          });
        } else {
          rtdbRecords = [];
        }
        handleMergeStatuses();
      }, (err) => {
        console.warn("Could not load RTDB statuses in Inventory view.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB statuses subscription failed in Inventory: ", e);
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

  const handleUpdateImageLink = async () => {
    if (!editingImageItem) return;
    try {
      const updatedImg = newImageLink.trim();
      if (!updatedImg) {
        showToast("Please enter a valid image address link or cancel.", "warn");
        return;
      }
      
      // Update in Firestore
      await updateDoc(doc(db, 'inventory', editingImageItem.id), {
        img: updatedImg
      });

      // Update in Realtime Database
      try {
        await update(ref(rtdb, `inventory/${editingImageItem.id}`), {
          img: updatedImg
        });
      } catch (e) {
        console.warn("RTDB sync error during image update:", e);
      }

      showToast(`Successfully updated image for ${editingImageItem.name}`, "info");
      setIsImagePromptOpen(false);
      setEditingImageItem(null);
      setNewImageLink('');
    } catch (error) {
      console.error("Error updating image:", error);
      showToast("Failed to update image link. Please check permissions.", "error");
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
      // 1. For a stock hold / reservation, we do NOT deduct the stock immediately from the location/total.
      // It stays in the warehouse on-hand for tracking, but shows as reserved/subtracted in available calculations.
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
        stockDeducted: false,
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
        stockDeducted: false,
        ts: Date.now()
      };

      await set(ref(rtdb, `reservations/${targetId}`), payloadRtdb);

      // 3. Create a corresponding Order Status record in the Status Tracker (statuses collection)
      const statusPayloadFirestore = {
        order: holdOrderId.trim().toUpperCase(),
        item: holdModal.item.name,
        qty: qtyNum,
        status: 'Reserve',
        where: holdLocation,
        remarks: holdRemarks.trim() ? `[Stock Hold] ${holdRemarks.trim()}` : '[Stock Hold] Reserved from catalog',
        actor: user?.email || 'System',
        stockDeducted: false,
        ts: serverTimestamp()
      };

      const statusPayloadRtdb = {
        order: holdOrderId.trim().toUpperCase(),
        item: holdModal.item.name,
        qty: qtyNum,
        status: 'Reserve',
        where: holdLocation,
        remarks: holdRemarks.trim() ? `[Stock Hold] ${holdRemarks.trim()}` : '[Stock Hold] Reserved from catalog',
        actor: user?.email || 'System',
        stockDeducted: false,
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

  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDetails.name.trim()) {
      showToast("Item name is required!", "warn");
      return;
    }

    setIsSavingItem(true);
    setSaveSuccessDetails(null);

    try {
      const nameClean = newItemDetails.name.trim();

      // Check if item with this name already exists (case-insensitive check)
      const existing = products.find(p => p.name && p.name.toLowerCase() === nameClean.toLowerCase());
      if (existing) {
        showToast(`An item named "${nameClean}" already exists. Feel free to use 'Add Inventory' to increase its quantity!`, "warn");
        setIsSavingItem(false);
        return;
      }

      const qOld = parseInt(newItemDetails.qtyOld) || 0;
      const qNew = parseInt(newItemDetails.qtyNew) || 0;
      const qOffice = parseInt(newItemDetails.qtyOffice) || 0;
      const totalQty = qOld + qNew + qOffice;
      const stockGoal = parseInt(newItemDetails.goal) || 0;
      const barcodes = newItemDetails.barcode.trim() ? [newItemDetails.barcode.trim()] : [];
      const img = newItemDetails.imgUrl.trim() || getFallbackImage(nameClean);

      // Custom document ID to match in both DBs
      const customId = doc(collection(db, 'inventory')).id;

      const mainLocation = qOffice > qOld && qOffice > qNew ? 'Office' : (qNew > qOld ? 'New warehouse' : 'Old warehouse');

      // 1. Write to Realtime Database
      await set(ref(rtdb, `inventory/${customId}`), {
        name: nameClean,
        qtyOld: qOld,
        qtyNew: qNew,
        qtyOffice: qOffice,
        qty: totalQty,
        goal: stockGoal,
        barcodes,
        img,
        location: mainLocation,
        isNew: true,
        createdAt: Date.now()
      });

      // 2. Write to Firestore
      await setDoc(doc(db, 'inventory', customId), {
        name: nameClean,
        qtyOld: qOld,
        qtyNew: qNew,
        qtyOffice: qOffice,
        qty: totalQty,
        goal: stockGoal,
        barcodes,
        img,
        location: mainLocation,
        isNew: true,
        createdAt: serverTimestamp()
      });

      // Show database success state explicitly
      setSaveSuccessDetails({ name: nameClean, qty: totalQty });
      showToast(`Successfully added "${nameClean}" to the databases!`, "info");
      
      // Auto dismiss modal success screen after 3 seconds, or let user close
      setTimeout(() => {
        // Reset states
        setNewItemDetails({
          name: '',
          qtyOld: '0',
          qtyNew: '0',
          qtyOffice: '0',
          goal: '5',
          barcode: '',
          imgUrl: ''
        });
      }, 500);

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    } finally {
      setIsSavingItem(false);
    }
  };

  return (
    <div className="min-h-screen bg-white -m-6 p-6 space-y-6 animate-in fade-in duration-500 pb-24">
      
      {/* Target UI Title Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e6decf] pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#1E293B] tracking-tight">Adjust Stock</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={() => setIsAddItemModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-[10.5px] font-extrabold uppercase tracking-wider hover:bg-indigo-700 transition-all hover:shadow shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Item
          </button>
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
          
          // Get of all loans/rents for this item from statuses
          const itemLoans = statuses.filter(s => s.item && s.item.toLowerCase() === item.name.toLowerCase() && (s.status === 'Loan' || s.status === 'Rent'));
          const loanedQty = itemLoans.reduce((acc, curr) => acc + (curr.qty || 0), 0);

          // Total available stock is the database count minus units
          const availableQty = Math.max(0, (item.qty || 0) - loanedQty - reservedQty);
          const onHandQty = (item.qty || 0);

          // Compute dynamic available counts for each individual location
          const oldWhReserved = itemReservations.filter(r => r.location === 'Old warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
          const newWhReserved = itemReservations.filter(r => r.location === 'New warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
          const officeReserved = itemReservations.filter(r => r.location === 'Office').reduce((acc, curr) => acc + (curr.qty || 0), 0);

          const oldWhLoaned = itemLoans.filter(s => s.where === 'Old warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
          const newWhLoaned = itemLoans.filter(s => s.where === 'New warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
          const officeLoaned = itemLoans.filter(s => s.where === 'Office').reduce((acc, curr) => acc + (curr.qty || 0), 0);

          let displayQtyOld = Math.max(0, (item.qtyOld || 0) - oldWhLoaned - oldWhReserved);
          let displayQtyNew = Math.max(0, (item.qtyNew || 0) - newWhLoaned - newWhReserved);
          let displayQtyOffice = Math.max(0, (item.qtyOffice || 0) - officeLoaned - officeReserved);

          const sumLocs = displayQtyOld + displayQtyNew + displayQtyOffice;
          if (sumLocs > availableQty) {
            let gap = sumLocs - availableQty;
            const fromNew = Math.min(displayQtyNew, gap);
            displayQtyNew -= fromNew;
            gap -= fromNew;

            if (gap > 0) {
              const fromOld = Math.min(displayQtyOld, gap);
              displayQtyOld -= fromOld;
              gap -= fromOld;
            }

            if (gap > 0) {
              const fromOffice = Math.min(displayQtyOffice, gap);
              displayQtyOffice -= fromOffice;
              gap -= fromOffice;
            }
          }
          
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
                <button 
                  type="button"
                  onClick={() => {
                    setEditingImageItem(item);
                    setNewImageLink(item.img || '');
                    setIsImagePromptOpen(true);
                  }}
                  className="absolute top-2.5 left-2.5 bg-white/95 hover:bg-slate-50 border border-[#e2d7c5] p-1.5 rounded-lg shadow-sm cursor-pointer z-10 transition-colors"
                  title="Update Image Address Link"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-700" />
                </button>

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
                <div className="space-y-2.5">
                  <h3 className="text-[13px] font-bold text-[#1E293B] line-clamp-2 leading-tight">
                    {item.name}
                  </h3>

                  {/* Hero Highlight for Available to Use Stock */}
                  <div className="bg-emerald-50/80 border border-emerald-100/90 rounded-[14px] p-3 flex items-center justify-between shadow-xs">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider leading-none">Available Stock</span>
                      <span className="text-[9px] font-bold text-slate-400 mt-0.5 leading-none">Ready for checkout</span>
                    </div>
                    <div className="text-right flex items-baseline gap-0.5 leading-none">
                      <span className="text-2xl font-black text-emerald-600 tracking-tight">{availableQty}</span>
                      <span className="text-[9px] font-extrabold text-emerald-700 uppercase ml-0.5">units</span>
                    </div>
                  </div>
                </div>

                {/* Warehousing Locations Layout & Pill Styles matching user screenshot */}
                <div className="space-y-1.5 py-1">
                  {/* Old Warehouse */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 bg-[#F1EFE9] border border-[#E3DCD1] text-[10px] font-extrabold text-slate-600 px-3 py-0.5 rounded-full uppercase tracking-wider">
                      🏫 Old warehouse
                    </span>
                    <span className="text-xs font-black text-slate-800">{displayQtyOld}</span>
                  </div>

                  {/* New Warehouse */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 bg-[#F1EFE9] border border-[#E3DCD1] text-[10px] font-extrabold text-slate-600 px-3 py-0.5 rounded-full uppercase tracking-wider">
                      🏫 New warehouse
                    </span>
                    <span className="text-xs font-black text-slate-800">{displayQtyNew}</span>
                  </div>

                  {/* Office */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 bg-[#FEF3C7] border border-[#FDE68A] text-[10px] font-extrabold text-amber-800 px-3 py-0.5 rounded-full uppercase tracking-wider">
                      🏷️ Office
                    </span>
                    <span className="text-xs font-black text-slate-800">{displayQtyOffice}</span>
                  </div>

                  {/* Reserved (Dedicated inventory card row display right below Office) */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 bg-amber-50 border border-amber-200/60 text-[10px] font-extrabold text-amber-800 px-3 py-0.5 rounded-full uppercase tracking-wider">
                      🔖 Reserved
                    </span>
                    <span className={cn(
                      "text-xs font-black",
                      reservedQty > 0 ? "text-amber-600 font-extrabold" : "text-slate-400"
                    )}>
                      {reservedQty || 0}
                    </span>
                  </div>
                </div>

                {/* Subtext and Goal */}
                <div className="text-[10.5px] text-[#8C8273] font-bold tracking-wide flex flex-col gap-0.5">
                  <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded-lg text-slate-700">
                    <span className="text-slate-500 text-[10px] uppercase font-extrabold tracking-wider">Safety Target</span>
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

        {/* Custom Image Address Update Modal */}
        {isImagePromptOpen && editingImageItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => {
                setIsImagePromptOpen(false);
                setEditingImageItem(null);
              }} 
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
                  <Camera className="w-4 h-4 text-[#8C8273]" />
                  <span>Update Stock Image URL</span>
                </h3>
                <button 
                  onClick={() => {
                    setIsImagePromptOpen(false);
                    setEditingImageItem(null);
                  }} 
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 font-sans">
                <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#EDE7DF]">
                  <p className="text-[9px] text-[#8C8273] font-black uppercase tracking-wider">{editingImageItem.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Provide an image web link (address URL) to visually represent this item in the inventory catalog.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-black">Image Address Link</label>
                  <input 
                    type="url" 
                    placeholder="https://example.com/image.jpg"
                    value={newImageLink} 
                    onChange={e => setNewImageLink(e.target.value)} 
                    className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-semibold outline-none focus:border-[#beb29c] transition-colors"
                  />
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-4 bg-[#FAF8F5] border-t border-[#F2EDE2] flex gap-2.5 justify-end">
                <button 
                  type="button"
                  onClick={() => {
                    setIsImagePromptOpen(false);
                    setEditingImageItem(null);
                  }} 
                  className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider border border-[#d8cdbc] hover:bg-slate-50 text-slate-500 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleUpdateImageLink}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95"
                >
                  Submit
                </button>
              </div>
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
                  {(() => {
                    const activeItem = holdModal.item;
                    if (!activeItem) return null;

                    const itemLoans = statuses.filter(s => s.item && s.item.toLowerCase() === activeItem.name.toLowerCase() && (s.status === 'Loan' || s.status === 'Rent'));
                    const loanedQty = itemLoans.reduce((acc, curr) => acc + (curr.qty || 0), 0);
                    const oldWhLoaned = itemLoans.filter(s => s.where === 'Old warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
                    const newWhLoaned = itemLoans.filter(s => s.where === 'New warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
                    const officeLoaned = itemLoans.filter(s => s.where === 'Office').reduce((acc, curr) => acc + (curr.qty || 0), 0);

                    const itemReservations = reservations.filter(r => r.itemId === activeItem.id && r.status === 'Packing');
                    const reservedQty = itemReservations.reduce((acc, curr) => acc + (curr.qty || 0), 0);
                    const oldWhReserved = itemReservations.filter(r => r.location === 'Old warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
                    const newWhReserved = itemReservations.filter(r => r.location === 'New warehouse').reduce((acc, curr) => acc + (curr.qty || 0), 0);
                    const officeReserved = itemReservations.filter(r => r.location === 'Office').reduce((acc, curr) => acc + (curr.qty || 0), 0);

                    const availableQtyVal = Math.max(0, (activeItem.qty || 0) - loanedQty - reservedQty);

                    let displayQtyOldVal = Math.max(0, (activeItem.qtyOld || 0) - oldWhLoaned - oldWhReserved);
                    let displayQtyNewVal = Math.max(0, (activeItem.qtyNew || 0) - newWhLoaned - newWhReserved);
                    let displayQtyOfficeVal = Math.max(0, (activeItem.qtyOffice || 0) - officeLoaned - officeReserved);

                    const sumLocsVal = displayQtyOldVal + displayQtyNewVal + displayQtyOfficeVal;
                    if (sumLocsVal > availableQtyVal) {
                      let gapVal = sumLocsVal - availableQtyVal;
                      const fromNewVal = Math.min(displayQtyNewVal, gapVal);
                      displayQtyNewVal -= fromNewVal;
                      gapVal -= fromNewVal;

                      if (gapVal > 0) {
                        const fromOldVal = Math.min(displayQtyOldVal, gapVal);
                        displayQtyOldVal -= fromOldVal;
                        gapVal -= fromOldVal;
                      }

                      if (gapVal > 0) {
                        const fromOfficeVal = Math.min(displayQtyOfficeVal, gapVal);
                        displayQtyOfficeVal -= fromOfficeVal;
                        gapVal -= fromOfficeVal;
                      }
                    }

                    return (
                      <select 
                        value={holdLocation} 
                        onChange={e => setHoldLocation(e.target.value)}
                        className="w-full bg-[#FCFBF9] border border-[#d8cdbc] rounded-lg p-2.5 text-xs font-bold outline-none cursor-pointer focus:border-amber-500 transition-colors"
                      >
                        <option value="Old warehouse">Old warehouse (Available: {displayQtyOldVal})</option>
                        <option value="New warehouse">New warehouse (Available: {displayQtyNewVal})</option>
                        <option value="Office">Office (Available: {displayQtyOfficeVal})</option>
                      </select>
                    );
                  })()}
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

        {isAddItemModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddItemModalOpen(false);
                setSaveSuccessDetails(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden font-sans text-slate-800 animate-in zoom-in-95 duration-150"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-800 tracking-tight text-lg uppercase tracking-[0.1em]">Catalog Registry</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 text-left">Define a Brand New Inventory SKU</p>
                </div>
                <button 
                  onClick={() => {
                    setIsAddItemModalOpen(false);
                    setSaveSuccessDetails(null);
                  }} 
                  className="p-2 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {isSavingItem ? (
                <div className="p-12 flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest animate-pulse">Syncing to cloud databases...</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Writing to Firestore & Realtime Databases</p>
                </div>
              ) : saveSuccessDetails ? (
                <div className="p-8 text-center flex flex-col items-center space-y-5">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-200 shadow-sm">
                    <BookmarkCheck className="w-8 h-8 stroke-[2px]" />
                  </div>
                  <div>
                    <h3 className="text-emerald-800 font-extrabold uppercase tracking-wide text-[11px] mb-1">Database Sync Successful</h3>
                    <h2 className="text-slate-800 font-black text-lg px-4 truncate max-w-md">{saveSuccessDetails.name}</h2>
                    <p className="text-slate-500 text-xs mt-1">Successfully inserted and mapped SKU into the active inventory databases with an initial stock of <strong className="font-extrabold text-slate-800">{saveSuccessDetails.qty}</strong> units.</p>
                  </div>

                  <div className="w-full bg-[#FAF8F5] border border-emerald-100 rounded-lg p-3 text-left">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Status</span>
                      <span className="text-emerald-600">● Live & Synced</span>
                    </div>
                  </div>

                  <div className="flex gap-2 w-full pt-2">
                    <button 
                      onClick={() => {
                        setSaveSuccessDetails(null);
                      }}
                      className="flex-1 py-3 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded font-bold text-[10.5px] uppercase tracking-widest active:scale-95 transition-all"
                    >
                      Register Another SKU
                    </button>
                    <button 
                      onClick={() => {
                        setIsAddItemModalOpen(false);
                        setSaveSuccessDetails(null);
                      }}
                      className="flex-1 py-3 bg-slate-900 text-white hover:bg-slate-800 rounded font-bold text-[10.5px] uppercase tracking-widest active:scale-95 transition-all shadow-md"
                    >
                      Done & Close
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateNewItem} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                  
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Item Name *</label>
                    <input 
                      type="text" 
                      required
                      value={newItemDetails.name}
                      onChange={e => setNewItemDetails({...newItemDetails, name: e.target.value})}
                      placeholder="e.g. Bambu Lab X1-Carbon 3D Printer" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-left">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Qty Old WH</label>
                      <input 
                        type="number" 
                        min="0"
                        value={newItemDetails.qtyOld}
                        onChange={e => setNewItemDetails({...newItemDetails, qtyOld: e.target.value})}
                        placeholder="0" 
                        className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Qty New WH</label>
                      <input 
                        type="number" 
                        min="0"
                        value={newItemDetails.qtyNew}
                        onChange={e => setNewItemDetails({...newItemDetails, qtyNew: e.target.value})}
                        placeholder="0" 
                        className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none text-slate-800"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Qty Office</label>
                      <input 
                        type="number" 
                        min="0"
                        value={newItemDetails.qtyOffice}
                        onChange={e => setNewItemDetails({...newItemDetails, qtyOffice: e.target.value})}
                        placeholder="0" 
                        className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-amber-500 uppercase tracking-widest block">Alert Threshold (Goal)</label>
                      <input 
                        type="number" 
                        min="0"
                        value={newItemDetails.goal}
                        onChange={e => setNewItemDetails({...newItemDetails, goal: e.target.value})}
                        placeholder="5" 
                        className="w-full bg-slate-50 border border-slate-100 text-amber-900 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-amber-100 outline-none"
                      />
                      <p className="text-[8.5px] text-slate-400 italic">Alert triggers when stock falls below this number</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Barcode/SKU Code (Optional)</label>
                      <input 
                        type="text" 
                        value={newItemDetails.barcode}
                        onChange={e => setNewItemDetails({...newItemDetails, barcode: e.target.value})}
                        placeholder="e.g. 506085189" 
                        className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Image URL (Optional)</label>
                    <input 
                      type="text" 
                      value={newItemDetails.imgUrl}
                      onChange={e => setNewItemDetails({...newItemDetails, imgUrl: e.target.value})}
                      placeholder="Leave blank for automatic robotics/STEM asset assignment" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none text-slate-800"
                    />
                  </div>

                  <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded font-bold text-[11px] uppercase tracking-widest mt-6 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                    Register Catalog SKU & Quantities
                  </button>
                </form>
              )}
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
