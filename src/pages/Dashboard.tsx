import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, TrendingUp, AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownRight, Plus, Scan, Tag, X, ChevronRight, Hash, Sliders, Bookmark, Search, MapPin } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/src/lib/utils';
import { db, collection, addDoc, onSnapshot, serverTimestamp, updateDoc, doc, arrayUnion, query, orderBy, handleFirestoreError, OperationType, auth, rtdb, ref, onValue, set, update, setDoc } from '@/src/lib/firebase';
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
  const [reservations, setReservations] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);

  // User selected location trend filter state
  const [selectedTrendsLocation, setSelectedTrendsLocation] = useState<'all' | 'old' | 'new' | 'office'>('all');

  // Search locator fields
  const [dashboardSearchText, setDashboardSearchText] = useState('');
  const [selectedLocateItem, setSelectedLocateItem] = useState<any | null>(null);
  const [showDashboardSearchDropdown, setShowDashboardSearchDropdown] = useState(false);
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warn' | 'error' } | null>(null);

  const showToast = (message: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };
  
  // Add New Stock State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', qty: '', location: 'Old warehouse' });
  const [addStockSource, setAddStockSource] = useState<'existing' | 'new'>('existing');
  const [selectedAddStockId, setSelectedAddStockId] = useState('');

  // Add Brand New Item to Inventory State
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [newItemDetails, setNewItemDetails] = useState({
    name: '',
    qtyOld: '0',
    qtyNew: '0',
    qtyOffice: '0',
    goal: '5',
    barcode: '',
    imgUrl: ''
  });

  // Helper to fallback robotics imagery for newly created items
  const getFallbackImage = (name: string): string => {
    const lowercase = name.toLowerCase();
    if (lowercase.includes('bambu') || lowercase.includes('printer')) {
      return 'https://images.unsplash.com/photo-1615811361523-6bd03d7748e7?w=500&auto=format&fit=crop&q=80';
    }
    if (lowercase.includes('drone') || lowercase.includes('propeller') || lowercase.includes('codrone') || lowercase.includes('skykick')) {
      return 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=500&auto=format&fit=crop&q=80';
    }
    if (lowercase.includes('makeblock') || lowercase.includes('mbot') || lowercase.includes('cyberpi')) {
      return 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=500&auto=format&fit=crop&q=80';
    }
    if (lowercase.includes('micro:bit') || lowercase.includes('elecfreaks') || lowercase.includes('circuit')) {
      return 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=80';
    }
    if (lowercase.includes('matatastudio') || lowercase.includes('vincibot') || lowercase.includes('coding')) {
      return 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=500&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=500&auto=format&fit=crop&q=80';
  };

  // Adjust Stock State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedAdjustItemId, setSelectedAdjustItemId] = useState<string>('');
  const [adjMode, setAdjMode] = useState<'add' | 'sub'>('add');
  const [adjAmount, setAdjAmount] = useState('1');
  const [adjLocation, setAdjLocation] = useState('Old warehouse');
  const [adjPurpose, setAdjPurpose] = useState('');
  const [adjTakenBy, setAdjTakenBy] = useState('');

  // Hold Stock State
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [selectedHoldItemId, setSelectedHoldItemId] = useState<string>('');
  const [holdClientName, setHoldClientName] = useState('');
  const [holdQty, setHoldQty] = useState('1');
  const [holdRemarks, setHoldRemarks] = useState('');
  const [holdOrderId, setHoldOrderId] = useState('');
  const [holdLocation, setHoldLocation] = useState('Old warehouse');
  
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
      firestoreItems = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          name: data.name || data.itemName || 'Unnamed Item',
          qty: data.qty ?? data.quantity ?? 0,
          qtyOld: data.qtyOld ?? data.quantityOld ?? 0,
          qtyNew: data.qtyNew ?? data.quantityNew ?? 0,
          qtyOffice: data.qtyOffice ?? data.quantityOffice ?? 0
        };
      });
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
          remarks: data.remarks || '',
          location: data.location || 'Old warehouse',
          actor: data.actor || '',
          ts: data.ts
        };
      });
      handleMergeRes();
    }, (error) => {
      console.warn("Could not load Firestore reservations in Dashboard view.", error);
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
        console.warn("Could not load RTDB reservations in Dashboard view.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB reservations subscription failed in Dashboard: ", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  // Sync statuses in real-time from Firebase (Firestore + RTDB)
  useEffect(() => {
    let firestoreRecords: any[] = [];
    let rtdbRecords: any[] = [];

    const handleMergeStatuses = () => {
      const mergedMap = new Map<string, any>();
      rtdbRecords.forEach(record => mergedMap.set(record.id, record));
      firestoreRecords.forEach(record => mergedMap.set(record.id, record));
      setStatuses(Array.from(mergedMap.values()));
    };

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
      console.warn("Could not load Firestore statuses in Dashboard view.", error);
    });

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
        console.warn("Could not load RTDB statuses in Dashboard view.", err);
      });
      unsubscribeRtdb = () => rtdbUnsub();
    } catch (e) {
      console.error("RTDB statuses subscription failed in Dashboard: ", e);
    }

    return () => {
      unsubscribeFirestore();
      unsubscribeRtdb();
    };
  }, [user]);

  // Action Handlers for Dashboard level quick functions
  const handleAdjust = async () => {
    if (!selectedAdjustItemId || !adjAmount) {
      showToast("Please select an item and fill in quantity", "warn");
      return;
    }
    const item = inventory.find(i => i.id === selectedAdjustItemId);
    if (!item) return;

    const amt = parseInt(adjAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("Please specify a valid quantity greater than 0", "warn");
      return;
    }
    
    if (!adjPurpose || !adjTakenBy) {
      showToast("Please provide purpose and adjuster name", "warn");
      return;
    }

    const delta = adjMode === 'add' ? amt : -amt;
    const fieldMap: any = { 'Old warehouse': 'qtyOld', 'New warehouse': 'qtyNew', 'Office': 'qtyOffice' };
    const field = fieldMap[adjLocation];
    
    const prevVal = item[field] || 0;
    if (adjMode === 'sub' && prevVal < amt) {
      showToast(`Insufficient stock in ${adjLocation}. Only ${prevVal} available.`, "warn");
      return;
    }

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
        actor: localStorage.getItem('epedu_username') || user?.email || 'Unknown',
        purpose: adjPurpose,
        takenBy: adjTakenBy
      });

      setIsAdjustModalOpen(false);
      setSelectedAdjustItemId('');
      setAdjAmount('1');
      setAdjPurpose('');
      setAdjTakenBy('');
      showToast("Stock updated successfully!", "info");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleCreateHold = async () => {
    if (!selectedHoldItemId || !holdClientName || !holdQty || !holdOrderId) {
      showToast("Please fill in Order ID, Client Name, and Quantity", "warn");
      return;
    }
    const item = inventory.find(i => i.id === selectedHoldItemId);
    if (!item) return;

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
    const currentLocQty = item[field] || 0;

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
        itemId: item.id,
        itemName: item.name,
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
        itemId: item.id,
        itemName: item.name,
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
        item: item.name,
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
        item: item.name,
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
      } catch (status_err_rtdb) {
        console.warn("RTDB status sync failed:", status_err_rtdb);
      }

      setIsHoldModalOpen(false);
      setSelectedHoldItemId('');
      setHoldClientName('');
      setHoldQty('1');
      setHoldRemarks('');
      setHoldOrderId('');
      showToast("Stock reserved successfully!", "info");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.qty) return;

    let targetItemName = '';
    if (addStockSource === 'existing') {
      const activeId = selectedAddStockId || (inventory[0]?.id || '');
      const existingItem = inventory.find(i => i.id === activeId);
      if (!existingItem) {
        showToast("Please select an existing stock type first.", "warn");
        return;
      }
      targetItemName = existingItem.name;
    } else {
      if (!newItem.name.trim()) {
        showToast("Please enter an item name.", "warn");
        return;
      }
      targetItemName = newItem.name.trim();
    }

    try {
      const qtyNum = parseInt(newItem.qty);
      const existing = inventory.find(i => i.name && i.name.toLowerCase() === targetItemName.toLowerCase());

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

        // Write to Realtime Database
        await set(ref(rtdb, `inventory/${customId}`), {
          name: targetItemName,
          qtyOld,
          qtyNew,
          qtyOffice,
          qty: qtyNum,
          location: newItem.location,
          goal: 5,
          barcodes: [],
          isNew: true,
          createdAt: Date.now()
        });

        // Write to Firestore
        await setDoc(doc(db, 'inventory', customId), {
          name: targetItemName,
          qtyOld,
          qtyNew,
          qtyOffice,
          qty: qtyNum,
          location: newItem.location,
          goal: 5,
          barcodes: [],
          isNew: true,
          createdAt: serverTimestamp()
        });
      }
      setIsAddModalOpen(false);
      setNewItem({ name: '', qty: '', location: 'Old warehouse' });
      setAddStockSource('existing');
      setSelectedAddStockId('');
      showToast("Stock added successfully!", "info");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDetails.name.trim()) {
      showToast("Item name is required!", "warn");
      return;
    }

    try {
      const nameClean = newItemDetails.name.trim();

      // Check if item with this name already exists (case insensitive)
      const existing = inventory.find(i => i.name && i.name.toLowerCase() === nameClean.toLowerCase());
      if (existing) {
        showToast(`An item named "${nameClean}" already exists. Feel free to use 'Add New Stock' to increase its quantity instead!`, "warn");
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

      setIsAddItemModalOpen(false);
      setNewItemDetails({
        name: '',
        qtyOld: '0',
        qtyNew: '0',
        qtyOffice: '0',
        goal: '5',
        barcode: '',
        imgUrl: ''
      });
      showToast(`Successfully created new item: ${nameClean}`, "info");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const startScanner = async () => {
    setIsScannerOpen(true);
    setScannedCode(null);
    setScannerError(null);
    // Timeout to ensure the element is in the DOM
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode("reader");
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setScannedCode(decodedText);
            html5QrCode.stop();
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Camera/Scanner initialization failed: ", err);
        const errMessage = err?.message || String(err);
        if (errMessage.includes("NotAllowedError") || errMessage.includes("Permission denied")) {
          setScannerError("Camera Access Denied. Please ensure camera permissions are granted in your browser settings for the application frame.");
        } else {
          setScannerError(`Hardware Scanner Error: ${errMessage}`);
        }
      }
    }, 150);
  };

  const stats = [
    { label: 'Total Inventory', value: inventory.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0).toLocaleString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', change: '+12%', positive: true },
    { label: 'Registered SKU', value: inventory.length, icon: Tag, color: 'text-emerald-600', bg: 'bg-emerald-50', change: '+8%', positive: true },
    { label: 'Low Stock Items', value: inventory.filter(i => (Number(i.qty) || 0) < 5).length, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', change: '-3%', positive: false },
    { label: 'Warehouse Load', value: '88%', icon: CheckCircle2, color: 'text-rose-600', bg: 'bg-rose-50', change: '0%', positive: true },
  ];

  // Dynamic stock calculations per location for the trend chart
  const oldWarehouseQty = inventory.filter(item => item.location === 'Old warehouse').reduce((acc, item) => acc + (Number(item.qty) || 0), 0);
  const newWarehouseQty = inventory.filter(item => item.location === 'New warehouse').reduce((acc, item) => acc + (Number(item.qty) || 0), 0);
  const officeQty = inventory.filter(item => item.location === 'Office').reduce((acc, item) => acc + (Number(item.qty) || 0), 0);
  const totalQty = oldWarehouseQty + newWarehouseQty + officeQty;

  const displayTotal = totalQty === 0 ? 3490 : totalQty;
  const displayOld = oldWarehouseQty === 0 ? 1200 : oldWarehouseQty;
  const displayNew = newWarehouseQty === 0 ? 1800 : newWarehouseQty;
  const displayOffice = officeQty === 0 ? 490 : officeQty;

  const getChartData = () => {
    const multipliers = {
      all: [0.85, 0.9, 0.8, 1.1, 1.0, 1.3, 1.2],
      old: [1.1, 1.05, 1.0, 0.95, 0.98, 0.92, 1.0],
      new: [0.3, 0.5, 0.7, 0.9, 1.1, 1.35, 1.5],
      office: [0.6, 0.7, 0.65, 0.8, 0.85, 0.95, 1.0]
    };

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    const baseQty = {
      all: displayTotal,
      old: displayOld,
      new: displayNew,
      office: displayOffice
    }[selectedTrendsLocation];

    const activeMultipliers = multipliers[selectedTrendsLocation];

    return months.map((month, idx) => {
      const calculatedVal = Math.round(baseQty * (activeMultipliers[idx] || 1.0));
      return {
        name: month,
        stock: Math.max(0, calculatedVal)
      };
    });
  };

  const dynamicChartData = getChartData();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">System Perspective</h1>
          <p className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">EP Inventory Integration Hub</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://imagekit.io/dashboard/media-library/L0VQRURVIElOVkVOVE9SWSA"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10.5px] font-extrabold uppercase tracking-wider transition-all hover:shadow shadow-sm active:scale-95 shrink-0"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            ImageKit Link
          </a>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-[10.5px] font-extrabold uppercase tracking-wider hover:bg-slate-800 transition-all hover:shadow shadow-sm active:scale-95 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Stock
          </button>
        </div>
      </header>

      {/* Stock Locator Search Banner */}
      <div id="dashboard-stock-locator" className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent p-5 rounded-2xl border border-blue-200/50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest flex items-center gap-1.5">
            <Search className="w-4 h-4 animate-pulse text-blue-600" />
            Stock Locator Search Hub
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Find exactly which Rack and Shelf Level any inventory SKU is located on in real-time.
          </p>
        </div>
        <div className="relative flex-1 max-w-sm w-full">
          <div className="relative">
            <input
              type="text"
              placeholder="Type product name to locate... (e.g. mBot)"
              value={dashboardSearchText}
              onChange={(e) => {
                setDashboardSearchText(e.target.value);
                setShowDashboardSearchDropdown(true);
              }}
              onFocus={() => setShowDashboardSearchDropdown(true)}
              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 pl-4 pr-10 text-xs font-bold text-slate-800 outline-none shadow-xs transition-all focus:ring-4 focus:ring-blue-100"
            />
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
          
          {/* Autocomplete Dropdown */}
          {showDashboardSearchDropdown && dashboardSearchText.trim() && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowDashboardSearchDropdown(false)} 
              />
              <div className="absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 space-y-1">
                {inventory.filter(item => 
                  item.name.toLowerCase().includes(dashboardSearchText.toLowerCase())
                ).length > 0 ? (
                  inventory.filter(item => 
                    item.name.toLowerCase().includes(dashboardSearchText.toLowerCase())
                  ).map((item, idx) => {
                    const shelfLabel = item.rackId && item.rackLevel !== undefined && item.rackLevel !== -1 
                      ? `${item.rackLevel !== undefined ? `Level ${Number(item.rackLevel) + 1}` : 'Rack Assigned'}`
                      : null;
                    return (
                      <div
                        key={`dash-search-${item.id}-${idx}`}
                        onClick={() => {
                          setDashboardSearchText(item.name);
                          setSelectedLocateItem(item);
                          setShowDashboardSearchDropdown(false);
                        }}
                        className="p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors"
                      >
                        <div>
                          <p className="text-xs font-extrabold text-slate-800 uppercase leading-none">{item.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                            Qty: {item.qty} • Site: {item.location || 'Central'}
                          </p>
                        </div>
                        {shelfLabel ? (
                          <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-1 rounded border border-emerald-100 uppercase tracking-widest">
                            {shelfLabel}
                          </span>
                        ) : (
                          <span className="text-[8px] font-black bg-slate-50 text-slate-400 px-2 py-1 rounded border border-slate-100 uppercase tracking-widest">
                            Unallocated
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400 italic">No matching products found.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Locator Results Card */}
      {selectedLocateItem && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 bg-white border-2 border-emerald-500/20 rounded-2xl shadow-sm flex flex-col md:flex-row gap-5 items-center justify-between"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-extrabold shrink-0">
              <Package className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <p className="text-[9px] font-black tracking-wider uppercase text-emerald-600 mb-0.5">Stock Discovered & Location Mapped</p>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight leading-none">{selectedLocateItem.name}</h3>
              <p className="text-[11px] font-semibold text-slate-500 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Site Warehouse Location:</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold uppercase text-[9.5px] border border-slate-200">
                  {selectedLocateItem.location || 'Central Warehouse'}
                </span>
                {selectedLocateItem.rackId ? (
                  <>
                    <span className="text-slate-400">•</span>
                    <span>Placed inside rack deck level:</span>
                    <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black uppercase text-[9.5px] border border-emerald-200">
                      Level {Number(selectedLocateItem.rackLevel) + 1}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="text-rose-500 font-bold uppercase text-[10px]">No physical rack deck allocated yet</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 self-stretch sm:self-auto">
            {selectedLocateItem.rackId && (
              <button
                type="button"
                onClick={() => {
                  // Set local storage so Locations.tsx highlights on render
                  localStorage.setItem('locateStockItemId', selectedLocateItem.id);
                  localStorage.setItem('locateStockName', selectedLocateItem.name);
                  // Dispatch tab change event
                  window.dispatchEvent(new CustomEvent('change-tab', { detail: 'locations' }));
                }}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow active:scale-95 flex items-center justify-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5 stroke-[2.5px]" />
                <span>Locate In 3D Warehouse Map 🔍</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedLocateItem(null);
                setDashboardSearchText('');
              }}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors border border-slate-200"
            >
              Clear
            </button>
          </div>
        </motion.div>
      )}

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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Stock Dynamics</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                Location Focus: {selectedTrendsLocation === 'all' ? 'All Sites Combined' : selectedTrendsLocation === 'old' ? 'Old Warehouse Site' : selectedTrendsLocation === 'new' ? 'New Warehouse Site' : 'Office Storage Lab'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
               <button 
                 type="button"
                 onClick={() => setSelectedTrendsLocation('all')}
                 className={cn(
                   "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                   selectedTrendsLocation === 'all' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-slate-200"
                 )}
               >
                 All
               </button>
               <button 
                 type="button"
                 onClick={() => setSelectedTrendsLocation('old')}
                 className={cn(
                   "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                   selectedTrendsLocation === 'old' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-slate-200"
                 )}
               >
                 Old Warehouse
               </button>
               <button 
                 type="button"
                 onClick={() => setSelectedTrendsLocation('new')}
                 className={cn(
                   "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                   selectedTrendsLocation === 'new' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:bg-slate-200"
                 )}
               >
                 New Warehouse
               </button>
               <button 
                 type="button"
                 onClick={() => setSelectedTrendsLocation('office')}
                 className={cn(
                   "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                   selectedTrendsLocation === 'office' ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:bg-slate-200"
                 )}
               >
                 Office
               </button>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dynamicChartData}>
                <defs>
                  <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                    <stop 
                      offset="5%" 
                      stopColor={
                        selectedTrendsLocation === 'old' ? '#4f46e5' : 
                        selectedTrendsLocation === 'new' ? '#10b981' : 
                        selectedTrendsLocation === 'office' ? '#d97706' : '#2563eb'
                      } 
                      stopOpacity={0.15}
                    />
                    <stop 
                      offset="95%" 
                      stopColor={
                        selectedTrendsLocation === 'old' ? '#4f46e5' : 
                        selectedTrendsLocation === 'new' ? '#10b981' : 
                        selectedTrendsLocation === 'office' ? '#d97706' : '#2563eb'
                      } 
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: '1px solid #f1f5f9', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                    fontFamily: 'Inter, sans-serif' 
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="stock" 
                  stroke={
                    selectedTrendsLocation === 'old' ? '#4f46e5' : 
                    selectedTrendsLocation === 'new' ? '#10b981' : 
                    selectedTrendsLocation === 'office' ? '#d97706' : '#2563eb'
                  } 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorStock)" 
                />
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
                {/* Switcher Tabs */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left">Stock Type Selection Mode</label>
                  <div className="flex p-1 bg-slate-100 rounded-lg text-xs font-bold font-sans">
                    <button 
                      type="button"
                      onClick={() => setAddStockSource('existing')}
                      className={`flex-1 py-1.5 rounded transition-all text-[10px] uppercase tracking-wider ${addStockSource === 'existing' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Existing Stock Type
                    </button>
                    <button 
                      type="button"
                      onClick={() => setAddStockSource('new')}
                      className={`flex-1 py-1.5 rounded transition-all text-[10px] uppercase tracking-wider ${addStockSource === 'new' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      New Purchased Stock
                    </button>
                  </div>
                </div>

                {/* Conditional Field Display */}
                {addStockSource === 'existing' ? (
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Select Stock Type</label>
                    <select 
                      value={selectedAddStockId || (inventory[0]?.id || '')}
                      onChange={e => setSelectedAddStockId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-2.5 text-xs font-bold focus:bg-white focus:ring-1 focus:ring-blue-100 outline-none text-slate-800"
                    >
                      {inventory.length > 0 ? (
                        inventory.map((item, idx) => (
                          <option key={`opt-exist-${item.id}-${idx}`} value={item.id}>
                            {item.name} (Total Qty: {item.qty || 0})
                          </option>
                        ))
                      ) : (
                        <option>No items available - register new stock instead</option>
                      )}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Brand New Stock Name</label>
                    <input 
                      type="text" 
                      value={newItem.name}
                      onChange={e => setNewItem({...newItem, name: e.target.value})}
                      placeholder="e.g. Laserbox Rotary" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-blue-100 outline-none text-slate-800"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left">Quantity</label>
                    <input 
                      type="number" 
                      value={newItem.qty}
                      onChange={e => setNewItem({...newItem, qty: e.target.value})}
                      placeholder="0" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-blue-100 outline-none text-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left">Storage Unit</label>
                    <select 
                      value={newItem.location}
                      onChange={e => setNewItem({...newItem, location: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-blue-100 outline-none text-slate-800"
                    >
                      <option>Old warehouse</option>
                      <option>New warehouse</option>
                      <option>Office</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded font-bold text-[11px] uppercase tracking-widest mt-4 shadow-lg active:scale-95 transition-all">
                  Confirm Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isAddItemModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAddItemModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden font-sans text-slate-800"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-800 tracking-tight text-lg uppercase tracking-[0.1em]">Catalog Registry</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Define a Brand New Inventory SKU</p>
                </div>
                <button onClick={() => setIsAddItemModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleCreateNewItem} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item Name *</label>
                  <input 
                    type="text" 
                    required
                    value={newItemDetails.name}
                    onChange={e => setNewItemDetails({...newItemDetails, name: e.target.value})}
                    placeholder="e.g. Bambu Lab X1-Carbon 3D Printer" 
                    className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty Old WH</label>
                    <input 
                      type="number" 
                      min="0"
                      value={newItemDetails.qtyOld}
                      onChange={e => setNewItemDetails({...newItemDetails, qtyOld: e.target.value})}
                      placeholder="0" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty New WH</label>
                    <input 
                      type="number" 
                      min="0"
                      value={newItemDetails.qtyNew}
                      onChange={e => setNewItemDetails({...newItemDetails, qtyNew: e.target.value})}
                      placeholder="0" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty Office</label>
                    <input 
                      type="number" 
                      min="0"
                      value={newItemDetails.qtyOffice}
                      onChange={e => setNewItemDetails({...newItemDetails, qtyOffice: e.target.value})}
                      placeholder="0" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Alert Threshold (Goal)</label>
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Barcode/SKU Code (Optional)</label>
                    <input 
                      type="text" 
                      value={newItemDetails.barcode}
                      onChange={e => setNewItemDetails({...newItemDetails, barcode: e.target.value})}
                      placeholder="e.g. 506085189" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Image URL (Optional)</label>
                  <input 
                    type="text" 
                    value={newItemDetails.imgUrl}
                    onChange={e => setNewItemDetails({...newItemDetails, imgUrl: e.target.value})}
                    placeholder="Leave blank for automatic robotics/STEM asset assignment" 
                    className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white focus:ring-1 focus:ring-indigo-100 outline-none"
                  />
                </div>

                <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded font-bold text-[11px] uppercase tracking-widest mt-6 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                  Register Catalog SKU & Quantities
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
                <h2 className="font-bold text-slate-800 tracking-tight text-sm uppercase tracking-widest">EP Scan</h2>
                <button onClick={() => setIsScannerOpen(false)} className="p-1 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 font-sans">
                {scannerError ? (
                  <div className="space-y-4 text-center animate-in fade-in duration-200">
                    <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Camera Scan Unavailable</h3>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        {scannerError}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl text-left">
                      <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Developer Quick-Input Bypass:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type or paste SKU code manually..."
                          id="manual-barcode-bypass"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold focus:border-blue-500 outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = (e.currentTarget as HTMLInputElement).value.trim();
                              if (val) {
                                setScannedCode(val);
                                setScannerError(null);
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const inp = document.getElementById('manual-barcode-bypass') as HTMLInputElement;
                            const val = inp?.value?.trim();
                            if (val) {
                              setScannedCode(val);
                              setScannerError(null);
                            }
                          }}
                          className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all"
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                    <button onClick={startScanner} className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] uppercase tracking-widest mt-1">
                      Retry Camera Connection
                    </button>
                  </div>
                ) : !scannedCode ? (
                  <div className="space-y-3">
                    <div id="reader" className="w-full aspect-square bg-black rounded-lg overflow-hidden"></div>
                    <p className="text-[10px] text-slate-400 text-center font-semibold leading-normal">
                      Point your camera at a barcode or SKU label to increment shelf allocations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 text-center animate-in zoom-in-95 duration-200">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">Barcode Recognized</h3>
                      <p className="text-slate-500 font-mono text-sm mt-1">{scannedCode}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                       <button className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[11px] uppercase tracking-widest transition-all">
                          Increment Stock (+1)
                       </button>
                       <button onClick={startScanner} className="py-3 bg-slate-900 hover:bg-slate-850 text-white rounded font-bold text-[11px] uppercase tracking-widest transition-all">
                          Re-scan
                       </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Dynamic Adjust Stock Modal */}
        {isAdjustModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAdjustModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h2 className="font-bold text-slate-800 tracking-tight text-base uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-600" />
                  Quick Stock Adjustment
                </h2>
                <button onClick={() => setIsAdjustModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Stock Item</label>
                  <select
                    value={selectedAdjustItemId}
                    onChange={(e) => setSelectedAdjustItemId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2.5 text-xs font-bold outline-none cursor-pointer focus:bg-white focus:ring-1 focus:ring-blue-100 w-full"
                  >
                    <option value="">-- Choose Stock SKU --</option>
                    {inventory.map((item, idx) => (
                      <option key={item.id ? `opt-adj-${item.id}-${idx}` : `opt-adj-idx-${idx}`} value={item.id}>
                        {item.name} (Total: {item.qty ?? 0})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAdjustItemId && (() => {
                  const activeItem = inventory.find(i => i.id === selectedAdjustItemId);
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

                  const availableQty = Math.max(0, (activeItem.qty || 0) - loanedQty - reservedQty);

                  let displayQtyOld = Math.max(0, (activeItem.qtyOld || 0) - oldWhLoaned - oldWhReserved);
                  let displayQtyNew = Math.max(0, (activeItem.qtyNew || 0) - newWhLoaned - newWhReserved);
                  let displayQtyOffice = Math.max(0, (activeItem.qtyOffice || 0) - officeLoaned - officeReserved);

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
                    <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#EDE7DF] space-y-1 text-center">
                      <p className="text-[9px] text-[#8C8273] font-bold uppercase tracking-wider">Current Stock levels (Available)</p>
                      <div className="grid grid-cols-3 gap-2 mt-1.5 text-[10.5px] font-bold text-slate-600">
                        <span className="bg-[#FCFBF9] border border-[#d8cdbc]/50 py-1 rounded">Old WH: {displayQtyOld}</span>
                        <span className="bg-[#FCFBF9] border border-[#d8cdbc]/50 py-1 rounded">New WH: {displayQtyNew}</span>
                        <span className="bg-[#FCFBF9] border border-[#d8cdbc]/50 py-1 rounded">Office: {displayQtyOffice}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjustment Direction</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjMode('add')}
                      className={cn(
                        "py-2 rounded text-[10.5px] font-extrabold uppercase tracking-wide border transition-all",
                        adjMode === 'add' ? "bg-amber-50 border-amber-500 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      (+) Increase Level
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjMode('sub')}
                      className={cn(
                        "py-2 rounded text-[10.5px] font-extrabold uppercase tracking-wide border transition-all",
                        adjMode === 'sub' ? "bg-slate-900 border-slate-900 text-white" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      (–) Decrease Level
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity change</label>
                    <input 
                      type="number" 
                      value={adjAmount}
                      onChange={e => setAdjAmount(e.target.value)}
                      placeholder="qty" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Storage Location</label>
                    <select 
                      value={adjLocation}
                      onChange={e => setAdjLocation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2.5 text-xs font-bold outline-none cursor-pointer"
                    >
                      <option>Old warehouse</option>
                      <option>New warehouse</option>
                      <option>Office</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Purpose / Remarks</label>
                  <input
                    type="text"
                    value={adjPurpose}
                    onChange={e => setAdjPurpose(e.target.value)}
                    placeholder="e.g. Restocking, Sales Deliveries, Demo Unit"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjusted By (Name)</label>
                  <input
                    type="text"
                    value={adjTakenBy}
                    onChange={e => setAdjTakenBy(e.target.value)}
                    placeholder="e.g. Admin or Operator Initial"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white outline-none"
                  />
                </div>

                <button 
                  onClick={handleAdjust}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[11px] uppercase tracking-widest mt-4 shadow-lg active:scale-95 transition-all"
                >
                  Confirm Level Adjustment
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Dynamic Hold Stock Modal */}
        {isHoldModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsHoldModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h2 className="font-bold text-slate-800 tracking-tight text-base uppercase tracking-wider flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-teal-600" />
                  Reserve / Hold stock
                </h2>
                <button onClick={() => setIsHoldModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Item to Hold</label>
                  <select
                    value={selectedHoldItemId}
                    onChange={(e) => setSelectedHoldItemId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2.5 text-xs font-bold outline-none cursor-pointer focus:bg-white focus:ring-1 focus:ring-blue-100 w-full"
                  >
                    <option value="">-- Choose Stock SKU --</option>
                    {inventory.map((item, idx) => (
                      <option key={item.id ? `opt-hold-${item.id}-${idx}` : `opt-hold-idx-${idx}`} value={item.id}>
                        {item.name} (Total: {item.qty ?? 0})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedHoldItemId && (() => {
                  const activeItem = inventory.find(i => i.id === selectedHoldItemId);
                  if (!activeItem) return null;
                  const activeHolds = reservations
                    .filter(r => r.itemId === activeItem.id && r.status === 'Packing')
                    .reduce((acc, curr) => acc + (curr.qty || 0), 0);

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

                  const availableQty = Math.max(0, (activeItem.qty || 0) - loanedQty - reservedQty);

                  let displayQtyOld = Math.max(0, (activeItem.qtyOld || 0) - oldWhLoaned - oldWhReserved);
                  let displayQtyNew = Math.max(0, (activeItem.qtyNew || 0) - newWhLoaned - newWhReserved);
                  let displayQtyOffice = Math.max(0, (activeItem.qtyOffice || 0) - officeLoaned - officeReserved);

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
                    <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#EDE7DF] space-y-1.5 text-center">
                      <p className="text-[9px] text-[#8C8273] font-bold uppercase tracking-wider">Storage Capacity Overview (Available)</p>
                      <div className="flex items-center justify-center gap-4 text-[10px] font-bold">
                        <span className="text-slate-600">Available: {availableQty}</span>
                        <span className="text-[#8C8273]">•</span>
                        <span className="text-amber-700 font-extrabold">Currently Reserved: {activeHolds}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1 text-[9.5px] font-bold text-slate-500">
                        <span className="bg-[#FCFBF9] py-0.5 rounded border">Old WH: {displayQtyOld}</span>
                        <span className="bg-[#FCFBF9] py-0.5 rounded border">New WH: {displayQtyNew}</span>
                        <span className="bg-[#FCFBF9] py-0.5 rounded border">Office: {displayQtyOffice}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order / Hold ID</label>
                    <input 
                      type="text" 
                      value={holdOrderId}
                      onChange={e => setHoldOrderId(e.target.value)}
                      placeholder="e.g. ORD-10045" 
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hold Quantity</label>
                    <input 
                      type="number" 
                      value={holdQty}
                      onChange={e => setHoldQty(e.target.value)}
                      placeholder="1" 
                      min="1"
                      className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hold Stock From Location</label>
                  {(() => {
                    const activeItem = inventory.find(i => i.id === selectedHoldItemId);
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
                        className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2.5 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="Old warehouse">Old warehouse (Available: {displayQtyOldVal})</option>
                        <option value="New warehouse">New warehouse (Available: {displayQtyNewVal})</option>
                        <option value="Office">Office (Available: {displayQtyOfficeVal})</option>
                      </select>
                    );
                  })()}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name / School Entity</label>
                  <input 
                    type="text" 
                    value={holdClientName}
                    onChange={e => setHoldClientName(e.target.value)}
                    placeholder="e.g. Marlon Tech Academy" 
                    className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remarks / Details</label>
                  <input 
                    type="text" 
                    value={holdRemarks}
                    onChange={e => setHoldRemarks(e.target.value)}
                    placeholder="Operational notes, delivery schedule" 
                    className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2.5 text-xs font-bold focus:bg-white outline-none"
                  />
                </div>

                <button 
                  onClick={handleCreateHold}
                  className="w-full py-3 bg-teal-650 hover:bg-teal-700 bg-teal-600 text-white rounded font-bold text-[11px] uppercase tracking-widest mt-4 shadow-lg active:scale-95 transition-all"
                >
                  Deduct & Create Reservation Hold
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Toast Notification Container */}
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
