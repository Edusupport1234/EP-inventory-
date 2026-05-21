import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid, Text, PivotControls } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/src/lib/utils';
import { 
  Plus, X, Package, Warehouse, Sliders, ChevronDown, ChevronUp, Layers, Info, Trash2, Edit3, MapPin, Check, Search, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Move 
} from 'lucide-react';
import { db, collection, addDoc, onSnapshot, updateDoc, doc, query, handleFirestoreError, OperationType, auth, deleteDoc, rtdb, ref, update } from '@/src/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';

interface RackData {
  id: string;
  name: string;
  position: [number, number, number];
  filled: number;
  zone: string;
  utilization: number;
  width?: number;
  length?: number;
  levelsCount?: number;
}

export function getZoneByZ(z: number) {
  if (z < -6) {
    return { name: 'Zone 1', color: '#ef4444', label: 'North End (Zone 1)', zCenter: -8 };
  } else if (z < -2) {
    return { name: 'Zone 2', color: '#f59e0b', label: 'North Central (Zone 2)', zCenter: -4 };
  } else if (z < 2) {
    return { name: 'Zone 3', color: '#10b981', label: 'Central Bay (Zone 3)', zCenter: 0 };
  } else if (z < 6) {
    return { name: 'Zone 4', color: '#3b82f6', label: 'South Central (Zone 4)', zCenter: 4 };
  } else {
    return { name: 'Zone 5', color: '#8b5cf6', label: 'South End (Zone 5)', zCenter: 8 };
  }
}

const LOCAL_ZONES = [
  { name: 'Zone 1', zCenter: -8, color: '#ef4444', label: 'RED ZONE • NORTH END' },
  { name: 'Zone 2', zCenter: -4, color: '#f59e0b', label: 'ORANGE ZONE • NORTH CENTRAL' },
  { name: 'Zone 3', zCenter: 0, color: '#10b981', label: 'GREEN ZONE • CENTRAL BAY' },
  { name: 'Zone 4', zCenter: 4, color: '#3b82f6', label: 'BLUE ZONE • SOUTH CENTRAL' },
  { name: 'Zone 5', zCenter: 8, color: '#8b5cf6', label: 'PURPLE ZONE • SOUTH END' },
];

function Rack({ 
  rack, 
  inventory,
  reservations = [],
  onMove, 
  onSelect,
  selectedLevelIndex,
  onSelectLevel,
  selectedRackId
}: { 
  rack: RackData, 
  inventory: any[],
  reservations: any[],
  onMove: (id: string, pos: [number, number, number]) => void,
  onSelect: (rack: RackData) => void,
  selectedLevelIndex: number | null,
  onSelectLevel: (levelIndex: number | null) => void,
  selectedRackId: string | undefined
}) {
  const [hovered, setHover] = useState(false);

  const W = rack.width ?? 2.0;
  const L = rack.length ?? 0.8;
  const N = rack.levelsCount ?? 3;
  const H = N * 1.0;

  // Render shelves: Base shelf is at 0.45, each subsequent level is spaced by 1.0 meter
  const shelves = Array.from({ length: N }).map((_, i) => i * 1.0 + 0.45);
  
  // Calculate dynamic active zone and corresponding indication colour
  const activeZone = getZoneByZ(rack.position[2]);

  return (
    <group>
      <PivotControls 
        scale={1.5} 
        activeAxes={[true, false, true]} // Only move along horizontal floor layout
        onDrag={(matrix) => {
          const position = new THREE.Vector3();
          position.setFromMatrixPosition(matrix);
          onMove(rack.id, [position.x, 0, position.z]);
        }}
        visible={hovered}
        depthTest={false}
      >
        <group 
          position={rack.position} 
          onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} 
          onPointerOut={() => setHover(false)}
          onClick={(e) => { e.stopPropagation(); onSelect(rack); }}
        >
          {/* Rack Frame Wirebox highlighted with Zone color */}
          <mesh position={[0, H / 2, 0]}>
            <boxGeometry args={[W, H, L]} />
            <meshStandardMaterial 
              color={activeZone.color} 
              wireframe 
              transparent 
              opacity={(hovered || selectedRackId === rack.id) ? 0.75 : 0.3} 
            />
          </mesh>

          {/* Heavy metal corner posts styled in the active zone's color */}
          {[
            [-W/2 + 0.05, -L/2 + 0.05],
            [-W/2 + 0.05, L/2 - 0.05],
            [W/2 - 0.05, -L/2 + 0.05],
            [W/2 - 0.05, L/2 - 0.05],
          ].map(([xPost, zPost], idx) => (
            <mesh key={`post-${xPost}-${zPost}-${idx}`} position={[xPost, H / 2, zPost]}>
              <cylinderGeometry args={[0.035, 0.035, H]} />
              <meshStandardMaterial color={activeZone.color} roughness={0.3} metalness={0.85} />
            </mesh>
          ))}

          {/* Render Shelves */}
          {shelves.map((y, i) => {
            const isSelectedShelf = selectedLevelIndex === i && selectedRackId === rack.id;
            return (
              <mesh 
                key={`shelf-${i}`} 
                position={[0, y, 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(rack);
                  onSelectLevel(i);
                }}
              >
                <boxGeometry args={[W - 0.1, 0.04, L - 0.05]} />
                <meshStandardMaterial color={isSelectedShelf ? "#2563eb" : "#94a3b8"} roughness={0.6} />
              </mesh>
            );
          })}

          {/* Render Inventory items visually as boxes */}
          {shelves.map((y, levelIndex) => {
            const levelItems = inventory.filter(item => Number(item.rackLevel) === levelIndex);
            const levelRes = reservations.filter(r => Number(r.rackLevel) === levelIndex);
            const totalBoxCount = levelItems.length + levelRes.length;
            if (totalBoxCount === 0) return null;

            const boxWidth = 0.4;
            const boxDepth = L - 0.2;
            const boxHeight = 0.5;

            const standardBoxes = levelItems.map((item, boxIdx) => {
              const ratio = totalBoxCount > 1 ? (boxIdx / (totalBoxCount - 1)) - 0.5 : 0;
              const xPos = ratio * (W - 0.8);

              const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
              const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
              const boxColor = colors[hash % colors.length];

              return (
                <group key={`std-box-${item.id}-${boxIdx}`} position={[xPos, y + boxHeight / 2 + 0.02, 0]}>
                  <mesh>
                    <boxGeometry args={[boxWidth, boxHeight, boxDepth]} />
                    <meshStandardMaterial color={boxColor} roughness={0.7} metalness={0.1} />
                  </mesh>
                </group>
              );
            });

            const reservationBoxes = levelRes.map((res, resIdx) => {
              const boxIdx = levelItems.length + resIdx;
              const ratio = totalBoxCount > 1 ? (boxIdx / (totalBoxCount - 1)) - 0.5 : 0;
              const xPos = ratio * (W - 0.8);

              return (
                <group key={`res-box-${res.id}-${resIdx}`} position={[xPos, y + boxHeight / 2 + 0.02, 0]}>
                  <mesh>
                    <boxGeometry args={[boxWidth * 1.05, boxHeight * 1.05, boxDepth * 1.05]} />
                    <meshStandardMaterial color="#f59e0b" roughness={0.3} metalness={0.7} />
                  </mesh>
                </group>
              );
            });

            return (
              <group key={`shelf-group-${levelIndex}-${y}`}>
                {standardBoxes}
                {reservationBoxes}
              </group>
            );
          })}

          <Text
            position={[0, H + 0.5, 0]}
            fontSize={0.35}
            color={activeZone.color}
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            {rack.name}
          </Text>
        </group>
      </PivotControls>
    </group>
  );
}

const WarehouseScene = ({ 
  racks, 
  inventory,
  reservations,
  onMoveRack, 
  onSelectRack,
  selectedLevelIndex,
  onSelectLevel,
  selectedRackId
}: { 
  racks: RackData[], 
  inventory: any[],
  reservations: any[],
  onMoveRack: (id: string, pos: [number, number, number]) => void,
  onSelectRack: (rack: RackData) => void,
  selectedLevelIndex: number | null,
  onSelectLevel: (levelIndex: number | null) => void,
  selectedRackId: string | undefined
}) => {
  return (
    <>
      <PerspectiveCamera makeDefault position={[12, 12, 12]} />
      <OrbitControls makeDefault minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.1} />
      
      <Environment preset="city" />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      <Grid 
        infiniteGrid 
        fadeDistance={50} 
        fadeStrength={5} 
        cellSize={1} 
        sectionSize={5} 
        sectionColor="#cbd5e1" 
        cellColor="#e2e8f0" 
      />

      {/* Visual representation of 5 vertical zones of the spatial layout */}
      {LOCAL_ZONES.map((zone) => (
        <group key={zone.name}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, zone.zCenter]}>
            <planeGeometry args={[32, 3.8]} />
            <meshStandardMaterial 
              color={zone.color} 
              transparent 
              opacity={0.065} 
              roughness={1}
            />
          </mesh>
          
          {/* Label lines */}
          <Text
            position={[-16.5, 0.04, zone.zCenter]}
            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            fontSize={0.4}
            color={zone.color}
            fontWeight="bold"
          >
            {zone.label}
          </Text>
          <Text
            position={[16.5, 0.04, zone.zCenter]}
            rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
            fontSize={0.4}
            color={zone.color}
            fontWeight="bold"
          >
            {zone.label}
          </Text>
        </group>
      ))}

      {racks.map((rack) => (
        <Rack 
          key={rack.id} 
          rack={rack} 
          inventory={inventory.filter(item => item.rackId === rack.id)}
          reservations={reservations.filter(res => res.rackId === rack.id)}
          onMove={onMoveRack} 
          onSelect={onSelectRack}
          selectedLevelIndex={selectedLevelIndex}
          onSelectLevel={onSelectLevel}
          selectedRackId={selectedRackId}
        />
      ))}

      {/* Floor plan standard layout mesh */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </>
  );
};

export default function Locations() {
  const [selectedRack, setSelectedRack] = useState<RackData | null>(null);
  const [selectedLevelIndex, setSelectedLevelIndex] = useState<number | null>(null);
  const [racks, setRacks] = useState<RackData[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [user, setUser] = useState(auth.currentUser);

  // States for live assignment form inputs
  const [addItemId, setAddItemId] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editZone, setEditZone] = useState<string>('');

  // States for Pop-Out Item Selection Level Assign Modal
  const [assignModal, setAssignModal] = useState<{ open: boolean, levelIndex: number | null }>({ open: false, levelIndex: null });
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [assignSearch, setAssignSearch] = useState<string>('');

  const [resAssignModal, setResAssignModal] = useState<{ open: boolean, levelIndex: number | null }>({ open: false, levelIndex: null });
  const [resAssignSearch, setResAssignSearch] = useState<string>('');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // Sync Rack Selection on fresh Firestore snapshots
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'racks'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbRacks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RackData));
      if (dbRacks.length === 0) {
        // Build initial seed if completely empty
        const initial = [
          { name: 'RACK-B-112', position: [-4, 0, -4], filled: 0, zone: 'Zone 2', utilization: 92, width: 2.2, length: 0.8, levelsCount: 3 },
          { name: 'RACK-A-102', position: [-4, 0, 0], filled: 0, zone: 'Zone 1', utilization: 45, width: 2.0, length: 0.8, levelsCount: 4 },
        ];
        initial.forEach(async (r) => {
          try {
            await addDoc(collection(db, 'racks'), r);
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'racks');
          }
        });
      } else {
        setRacks(dbRacks);
        // Resync properties in visual sidebar
        if (selectedRack) {
          const fresh = dbRacks.find(r => r.id === selectedRack.id);
          if (fresh) setSelectedRack(fresh);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'racks');
    });
    return () => unsubscribe();
  }, [user, selectedRack?.id]);

  // Read inventory data lists
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'inventory'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventory(dbItems);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });
    return () => unsubscribe();
  }, [user]);

  // Read reservations data lists for level placements
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'reservations'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbRes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReservations(dbRes);
    }, (error) => {
      console.warn("Could not load reservations in Locations view.", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Update layout control states
  useEffect(() => {
    if (selectedRack) {
      setEditName(selectedRack.name);
      setEditZone(selectedRack.zone || 'Zone 1');
    } else {
      setSelectedLevelIndex(null);
    }
  }, [selectedRack?.id, selectedRack?.zone]);

  const onMoveRack = async (id: string, newPos: [number, number, number]) => {
    const computedZone = getZoneByZ(newPos[2]).name;
    setRacks(prev => prev.map(r => r.id === id ? { ...r, position: newPos, zone: computedZone } : r));
    try {
      await updateDoc(doc(db, 'racks', id), { 
        position: newPos,
        zone: computedZone
      });
    } catch (error) {
      console.error("Error updating physical position:", error);
    }
  };

  const addRack = async () => {
    const randomZ = Math.random() * 16 - 8; // fits inside active bounds
    const computedZone = getZoneByZ(randomZ).name;
    const newRack = {
      name: `RACK-${String.fromCharCode(65 + Math.floor(Math.random() * 4))}-${Math.floor(Math.random() * 900 + 100)}`,
      position: [Math.random() * 12 - 6, 0, randomZ] as [number, number, number],
      filled: 0,
      zone: computedZone,
      utilization: 0,
      width: 2.0,
      length: 0.8,
      levelsCount: 3
    };
    try {
      await addDoc(collection(db, 'racks'), newRack);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'racks');
    }
  };

  const deleteRack = async (id: string) => {
    try {
      // Clear level location references of items stored here
      const placedItems = inventory.filter(item => item.rackId === id);
      for (const item of placedItems) {
        await updateDoc(doc(db, 'inventory', item.id), {
          rackId: '',
          rackLevel: -1
        });
      }
      await deleteDoc(doc(db, 'racks', id));
      setSelectedRack(null);
      setSelectedLevelIndex(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'racks');
    }
  };

  const updateRackProperty = async (fields: Partial<RackData>) => {
    if (!selectedRack) return;
    try {
      await updateDoc(doc(db, 'racks', selectedRack.id), fields);
      setSelectedRack(prev => prev ? { ...prev, ...fields } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'racks');
    }
  };

  const updateRackPosition = async (axis: 'x' | 'y' | 'z', delta: number) => {
    if (!selectedRack) return;
    try {
      const currentPos = [...selectedRack.position] as [number, number, number];
      if (axis === 'x') currentPos[0] = Number((currentPos[0] + delta).toFixed(2));
      if (axis === 'y') currentPos[1] = Number((currentPos[1] + delta).toFixed(2));
      if (axis === 'z') currentPos[2] = Number((currentPos[2] + delta).toFixed(2));
      
      let nextZone = selectedRack.zone;
      if (axis === 'z') {
        nextZone = getZoneByZ(currentPos[2]).name;
      }
      
      await updateDoc(doc(db, 'racks', selectedRack.id), {
        position: currentPos,
        zone: nextZone
      });
      setSelectedRack(prev => prev ? { ...prev, position: currentPos, zone: nextZone } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'racks');
    }
  };

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (!selectedRack) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      const step = e.shiftKey ? 1.0 : 0.2;
      
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        updateRackPosition('z', -step);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        updateRackPosition('z', step);
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        updateRackPosition('x', -step);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        updateRackPosition('x', step);
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        updateRackPosition('y', step);
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        updateRackPosition('y', -step);
      }
    };
    
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [selectedRack]);

  const handleAssignItem = async (levelIdx: number) => {
    if (!selectedRack || !addItemId) return;
    try {
      await updateDoc(doc(db, 'inventory', addItemId), {
        rackId: selectedRack.id,
        rackLevel: levelIdx
      });
      setAddItemId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleUnassignItem = async (itemId: string) => {
    try {
      await updateDoc(doc(db, 'inventory', itemId), {
        rackId: '',
        rackLevel: -1
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleUnassignReservation = async (reservationId: string) => {
    try {
      await updateDoc(doc(db, 'reservations', reservationId), {
        rackId: '',
        rackLevel: -1
      });
      try {
        await update(ref(rtdb, `reservations/${reservationId}`), {
          rackId: '',
          rackLevel: -1
        });
      } catch (err_rtdb) {}
    } catch (error) {
      console.error("Error unassigning reservation shelf placement: ", error);
    }
  };

  const handleAssignReservationToLevel = async (resId: string, levelIndex: number) => {
    if (!selectedRack) return;
    try {
      await updateDoc(doc(db, 'reservations', resId), {
        rackId: selectedRack.id,
        rackLevel: levelIndex
      });
      try {
        await update(ref(rtdb, `reservations/${resId}`), {
          rackId: selectedRack.id,
          rackLevel: levelIndex
        });
      } catch (err_rtdb) {}
    } catch (error) {
      console.error("Error assigning reservation shelf placement: ", error);
    }
  };

  const handleToggleSelect = (itemId: string) => {
    setTempSelectedIds(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId) 
        : [...prev, itemId]
    );
  };

  const handleConfirmAssign = async () => {
    if (assignModal.levelIndex === null || !selectedRack) return;
    const levelIdx = assignModal.levelIndex;
    try {
      // Find what was previously assigned to this level
      const previousItems = inventory.filter(p => p.rackId === selectedRack.id && Number(p.rackLevel) === levelIdx);
      
      // Items that are removed from selection:
      const toRemove = previousItems.filter(p => !tempSelectedIds.includes(p.id));
      for (const item of toRemove) {
        await updateDoc(doc(db, 'inventory', item.id), {
          rackId: '',
          rackLevel: -1
        });
      }

      // Assign selected items to this level:
      for (const itemId of tempSelectedIds) {
        await updateDoc(doc(db, 'inventory', itemId), {
          rackId: selectedRack.id,
          rackLevel: levelIdx
        });
      }

      setAssignModal({ open: false, levelIndex: null });
      setTempSelectedIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleCancelAssign = () => {
    setAssignModal({ open: false, levelIndex: null });
    setTempSelectedIds([]);
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500 overflow-hidden pb-4">
      <div className="flex-1 flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Location Matrix</h1>
            <p className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">Warehouse Floor Map & Configuration</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={addRack}
              className="bg-blue-600 text-white text-[11px] font-bold px-3 py-1.5 rounded hover:bg-blue-700 active:scale-95 transition-all shadow-md"
            >
              + ADD NEW RACK
            </button>
          </div>
        </header>

        {/* 3D Visualizer Render Port */}
        <div className="flex-1 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shadow-inner relative group min-h-[300px]">
          <Canvas shadows>
            <WarehouseScene 
              racks={racks} 
              inventory={inventory}
              reservations={reservations}
              onMoveRack={onMoveRack} 
              onSelectRack={setSelectedRack} 
              selectedLevelIndex={selectedLevelIndex}
              onSelectLevel={setSelectedLevelIndex}
              selectedRackId={selectedRack?.id}
            />
          </Canvas>

          {/* Helper Legend Panel overlay */}
          <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
             <div className="bg-slate-950/90 backdrop-blur p-2.5 rounded border border-slate-800 shadow-sm text-white">
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">ACTION</p>
                <p className="text-[10px] font-semibold">Drag Pivot Guides to Reposition</p>
             </div>
             <div className="bg-slate-950/90 backdrop-blur p-2.5 rounded border border-slate-800 shadow-sm text-white">
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">DISCOVER</p>
                <p className="text-[10px] font-semibold">Click shelves to expand contents</p>
             </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Properties & Level Content Sub-layers */}
      <aside className="w-full lg:w-96 bg-white border border-slate-200 rounded-lg flex flex-col p-5 shadow-sm overflow-y-auto">
        <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            <span>Rack Console</span>
          </h2>
          <span className={cn(
            "px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded",
            selectedRack ? "bg-blue-100 text-blue-700 font-bold" : "bg-slate-100 text-slate-400 font-normal"
          )}>
            {selectedRack ? 'Active' : 'Unselected'}
          </span>
        </div>

        {selectedRack ? (
          <div className="space-y-6 animate-in slide-up duration-300">
            {/* Base Properties Designation */}
            <div className="space-y-3.5 bg-slate-50 p-4 rounded-lg border border-slate-150">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ident Label</span>
                <button 
                  onClick={() => deleteRack(selectedRack.id)}
                  className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                  title="Purge Rack structure"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Rename Structure</span>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => { 
                      setEditName(e.target.value); 
                      updateRackProperty({ name: e.target.value }); 
                    }}
                    className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Sector Zone</span>
                  <select 
                    value={editZone}
                    onChange={(e) => { 
                      const selectedVal = e.target.value;
                      const zCoords: { [key: string]: number } = {
                        'Zone 1': -8,
                        'Zone 2': -4,
                        'Zone 3': 0,
                        'Zone 4': 4,
                        'Zone 5': 8,
                      };
                      const targetZ = zCoords[selectedVal] !== undefined ? zCoords[selectedVal] : 0;
                      const nextPos: [number, number, number] = [selectedRack.position[0], selectedRack.position[1], targetZ];
                      
                      setEditZone(selectedVal); 
                      updateRackProperty({ 
                        zone: selectedVal,
                        position: nextPos
                      }); 
                    }}
                    className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                  >
                    <option value="Zone 1">Zone 1 (North End)</option>
                    <option value="Zone 2">Zone 2 (North Central)</option>
                    <option value="Zone 3">Zone 3 (Central Bay)</option>
                    <option value="Zone 4">Zone 4 (South Central)</option>
                    <option value="Zone 5">Zone 5 (South End)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Adjustable Dimensions Section */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Warehouse className="w-3.5 h-3.5" />
                <span>Adjust Space Envelope</span>
              </h3>
              
              {/* Width Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Base Width (X-span)</span>
                  <span className="text-blue-600">{(selectedRack.width ?? 2.0).toFixed(1)}m</span>
                </div>
                <input 
                  type="range" 
                  min="1.0" 
                  max="4.0" 
                  step="0.1"
                  value={selectedRack.width ?? 2.0}
                  onChange={(e) => updateRackProperty({ width: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-ew-resize h-1 bg-slate-100 rounded-lg appearance-none"
                />
              </div>

              {/* Length/Depth Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Enclosure Length (Z-span)</span>
                  <span className="text-blue-600">{(selectedRack.length ?? 0.8).toFixed(1)}m</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1"
                  value={selectedRack.length ?? 0.8}
                  onChange={(e) => updateRackProperty({ length: parseFloat(e.target.value) })}
                  className="w-full accent-blue-600 cursor-ew-resize h-1 bg-slate-100 rounded-lg appearance-none"
                />
              </div>

              {/* Shelves/Levels Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Shelf Tiers (Y-layers)</span>
                  <span className="text-blue-600">{selectedRack.levelsCount ?? 3} Deck Levels</span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="6" 
                  step="1"
                  value={selectedRack.levelsCount ?? 3}
                  onChange={(e) => {
                    const newLevels = parseInt(e.target.value);
                    updateRackProperty({ levelsCount: newLevels });
                    if (selectedLevelIndex !== null && selectedLevelIndex >= newLevels) {
                      setSelectedLevelIndex(newLevels - 1);
                    }
                  }}
                  className="w-full accent-blue-600 cursor-ew-resize h-1 bg-slate-100 rounded-lg appearance-none"
                />
              </div>
            </div>

            {/* Free Spatial Position Controls */}
            <div className="space-y-4 bg-slate-50/80 p-4 rounded-xl border border-slate-150 relative overflow-hidden">
              <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-150">
                <Move className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                <span>Free Spatial Position</span>
              </h3>

              {/* Position coordinates readout/inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400">Coord X</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    value={Number(selectedRack.position[0].toFixed(2))} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateRackProperty({ position: [val, selectedRack.position[1], selectedRack.position[2]] });
                    }}
                    className="w-full text-center text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded py-1 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400">Coord Y (Height)</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    value={Number(selectedRack.position[1].toFixed(2))} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateRackProperty({ position: [selectedRack.position[0], val, selectedRack.position[2]] });
                    }}
                    className="w-full text-center text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded py-1 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400">Coord Z</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    value={Number(selectedRack.position[2].toFixed(2))} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const nextZone = getZoneByZ(val).name;
                      updateRackProperty({ 
                        position: [selectedRack.position[0], selectedRack.position[1], val],
                        zone: nextZone
                      });
                    }}
                    className="w-full text-center text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded py-1 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* D-Pad and Elevation layout */}
              <div className="flex gap-4 items-center justify-between py-1 bg-white p-3 rounded-lg border border-slate-100">
                {/* Horizontal D-Pad */}
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2">Flat Ground (W,S,A,D)</span>
                  
                  {/* D-Pad Grid Layout */}
                  <div className="grid grid-cols-3 gap-1.5 w-28">
                    <div />
                    <button 
                      onClick={() => updateRackPosition('z', -0.5)}
                      className="h-8 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-400 flex items-center justify-center transition-all duration-150 text-slate-700 hover:text-blue-600 active:scale-90"
                      title="Nudge Forward (W)"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <div />

                    <button 
                      onClick={() => updateRackPosition('x', -0.5)}
                      className="h-8 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-400 flex items-center justify-center transition-all duration-150 text-slate-700 hover:text-blue-600 active:scale-90"
                      title="Nudge Left (A)"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center text-[9px] font-black text-slate-500 select-none">
                      XZ
                    </div>
                    <button 
                      onClick={() => updateRackPosition('x', 0.5)}
                      className="h-8 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-400 flex items-center justify-center transition-all duration-150 text-slate-700 hover:text-blue-600 active:scale-90"
                      title="Nudge Right (D)"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <div />
                    <button 
                      onClick={() => updateRackPosition('z', 0.5)}
                      className="h-8 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-400 flex items-center justify-center transition-all duration-150 text-slate-700 hover:text-blue-600 active:scale-90"
                      title="Nudge Backward (S)"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <div />
                  </div>
                </div>

                {/* Vertical Elevation buttons */}
                <div className="flex flex-col items-center border-l border-slate-100 pl-4">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-2">Elevation (Q, E)</span>
                  <div className="flex flex-col gap-1.5 w-14 align-middle justify-center">
                    <button 
                      onClick={() => updateRackPosition('y', 0.5)}
                      className="h-8 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 flex items-center justify-center gap-1 transition-all duration-150 text-slate-700 hover:text-emerald-600 active:scale-90 text-[10px] font-bold"
                      title="Nudge Higher (Q)"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>+Y</span>
                    </button>
                    <button 
                      onClick={() => updateRackPosition('y', -0.5)}
                      className="h-8 rounded-lg bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-400 flex items-center justify-center gap-1 transition-all duration-150 text-slate-700 hover:text-amber-600 active:scale-90 text-[10px] font-bold"
                      title="Nudge Lower (E)"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>-Y</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Informative tips helper text */}
              <div className="text-[9px] text-slate-400 leading-snug">
                💡 <strong className="font-semibold text-slate-500">Pro-Tip:</strong> Click on the rack structure in the 3D model, then use keyboard hotkeys <kbd className="bg-slate-150 border border-slate-300 rounded px-1 font-mono text-[8.5px] text-slate-600 shadow-sm">W</kbd> <kbd className="bg-slate-150 border border-slate-300 rounded px-1 font-mono text-[8.5px] text-slate-600 shadow-sm">A</kbd> <kbd className="bg-slate-150 border border-slate-300 rounded px-1 font-mono text-[8.5px] text-slate-600 shadow-sm">S</kbd> <kbd className="bg-slate-150 border border-slate-300 rounded px-1 font-mono text-[8.5px] text-slate-600 shadow-sm">D</kbd> and <kbd className="bg-slate-150 border border-slate-300 rounded px-1 font-mono text-[8.5px] text-slate-600 shadow-sm">Q</kbd> / <kbd className="bg-slate-150 border border-slate-300 rounded px-1 font-mono text-[8.5px] text-slate-600 shadow-sm">E</kbd>. Hold down <kbd className="bg-slate-150 border border-slate-300 rounded px-1 font-mono text-[8.5px] text-slate-600 shadow-sm">Shift</kbd> to nudge using 1.0m strides!
              </div>
            </div>

            {/* Expansible Level / Shelf Contents section */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Layers className="w-3.5 h-3.5" />
                <span>Level Expansion Shelves</span>
              </h3>

              <div className="space-y-2">
                {Array.from({ length: selectedRack.levelsCount ?? 3 }).map((_, levelIdx) => {
                  const levelItems = inventory.filter(item => item.rackId === selectedRack.id && Number(item.rackLevel) === levelIdx);
                  const levelReservations = reservations.filter(r => r.rackId === selectedRack.id && Number(r.rackLevel) === levelIdx);
                  const isExpanded = selectedLevelIndex === levelIdx;

                  return (
                    <div 
                      key={levelIdx} 
                      className={cn(
                        "border rounded transition-all select-none overflow-hidden",
                        isExpanded ? "border-blue-500 bg-blue-50/10 shadow-sm" : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
                      )}
                    >
                      {/* Collapsible level header row */}
                      <div 
                        onClick={() => setSelectedLevelIndex(isExpanded ? null : levelIdx)}
                        className="p-3 flex items-center justify-between cursor-pointer text-xs font-bold text-slate-700"
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "w-2.5 h-2.5 rounded-full", 
                            isExpanded ? "bg-blue-600" : "bg-slate-400"
                          )} />
                          <span>Level {levelIdx + 1}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                          <span>{levelItems.length} items • {levelReservations.length} reserved</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      {/* Expanded list content */}
                      {isExpanded && (
                        <div className="p-3 border-t border-slate-100 bg-white space-y-3">
                          {/* List items placed currently */}
                          {(levelItems.length > 0 || levelReservations.length > 0) ? (
                            <div className="space-y-2">
                              {/* Standard Inventory Items */}
                              {levelItems.map((item, idx) => {
                                // Calculate same color index used in 3D boxes
                                const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                                const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
                                const boxColor = colors[hash % colors.length];

                                return (
                                  <div key={item.id ? `rack-item-${item.id}-${idx}` : `rack-item-idx-${idx}`} className="flex items-center justify-between bg-slate-50 p-2 rounded border border-slate-100">
                                    <div className="flex items-center gap-2 truncate">
                                      <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: boxColor }} />
                                      <p className="text-[11px] font-bold text-slate-800 uppercase truncate leading-snug">{item.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Qty: {item.qty}</span>
                                      <button 
                                        onClick={() => handleUnassignItem(item.id)}
                                        className="text-slate-450 hover:text-rose-600 p-1 hover:bg-slate-100 rounded"
                                        title="Shift out off rack deck position"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Reserved Client Holds */}
                              {levelReservations.map((res, idx) => (
                                <div key={res.id ? `rack-res-${res.id}-${idx}` : `rack-res-idx-${idx}`} className="flex items-center justify-between bg-amber-50/50 p-2 rounded border border-amber-100">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                    <div className="truncate">
                                      <p className="text-[11px] font-extrabold text-amber-900 uppercase truncate leading-snug">{res.orderId}</p>
                                      <p className="text-[9px] text-amber-700/80 uppercase truncate tracking-tight">{res.clientName}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 font-semibold">
                                    <span className="text-[9px] font-bold text-amber-850 bg-amber-100/80 px-1.5 py-0.5 rounded">Res Qty: {res.qty} ({res.itemName})</span>
                                    <button 
                                      onClick={() => handleUnassignReservation(res.id)}
                                      className="text-amber-500 hover:text-rose-600 p-1 hover:bg-amber-100/50 rounded"
                                      title="Remove from this rack level"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="py-4 text-center text-[10px] text-slate-400 italic">
                              This physical tier is unallocated.
                            </div>
                          )}

                          {/* Beautiful Dual Trigger buttons for Pop-Out selector */}
                          <div className="pt-2 border-t border-slate-100 flex gap-2">
                            <button 
                              onClick={() => {
                                const currentLevelItems = inventory.filter(p => p.rackId === selectedRack.id && Number(p.rackLevel) === levelIdx);
                                setTempSelectedIds(currentLevelItems.map(p => p.id));
                                setAssignModal({ open: true, levelIndex: levelIdx });
                                setAssignSearch('');
                              }}
                              className="flex-1 py-2 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 border border-dashed border-blue-200"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Standard Items ({levelItems.length})</span>
                            </button>

                            <button 
                              onClick={() => {
                                setResAssignModal({ open: true, levelIndex: levelIdx });
                                setResAssignSearch('');
                              }}
                              className="flex-1 py-2 bg-amber-55 hover:bg-amber-600 hover:text-white text-amber-600 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 border border-dashed border-amber-250 bg-amber-50"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Reserved holds ({levelReservations.length})</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3 text-slate-300">
              <Package className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-loose">Select a physical rack inside mapping engine to inspect properties</p>
          </div>
        )}
      </aside>

      {/* Pop-Out Items Selection Modal Popup */}
      <AnimatePresence>
        {assignModal.open && selectedRack && assignModal.levelIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={handleCancelAssign} 
              className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-800 text-[11px] uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Assign Items to Level {assignModal.levelIndex + 1}</span>
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Structure: {selectedRack.name} • {selectedRack.zone}
                  </p>
                </div>
                <button onClick={handleCancelAssign} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Informative Label Guidance */}
              <div className="px-5 pt-4">
                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100/60 text-blue-800 text-[10.5px] leading-relaxed font-medium">
                  💡 <strong className="font-bold">Selection Rule:</strong> Click once on any item in the list below to select/highlight it. Click a second time to unselect/remove it. Press <strong>Confirm Selection</strong> to apply.
                </div>
              </div>

              {/* Filtering input bar */}
              <div className="px-5 pt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-pulse" />
                  <input 
                    type="text"
                    placeholder="Search inventory items by name..."
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-9 pr-4 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Scrollable multi-selection items list */}
              <div className="p-5 max-h-80 overflow-y-auto space-y-2">
                {inventory.filter(item => 
                  item.name.toLowerCase().includes(assignSearch.toLowerCase())
                ).length > 0 ? (
                  inventory.filter(item => 
                    item.name.toLowerCase().includes(assignSearch.toLowerCase())
                  ).map(item => {
                    const isSelected = tempSelectedIds.includes(item.id);
                    const assignedRackName = item.rackId ? (racks.find(r => r.id === item.rackId)?.name) : null;
                    const isDirectTierAssigned = item.rackId === selectedRack.id && Number(item.rackLevel) === assignModal.levelIndex;

                    // Color code calculated same way as standard boxes
                    const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                    const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
                    const boxColor = colors[hash % colors.length];

                    return (
                      <div 
                        key={item.id}
                        onClick={() => handleToggleSelect(item.id)}
                        className={cn(
                          "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none active:scale-[0.99]",
                          isSelected 
                            ? "border-blue-600 bg-blue-50/20 shadow-sm" 
                            : "border-slate-100 bg-slate-50/40 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center gap-3 truncate">
                          {/* Checked box representation */}
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                            isSelected 
                              ? "bg-blue-600 border-blue-600 text-white" 
                              : "border-slate-300 bg-white"
                          )}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[4px]" />}
                          </div>

                          {/* Dynamic colour circle */}
                          <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: boxColor }} />

                          <div className="truncate">
                            <p className="text-xs font-bold text-slate-800 uppercase truncate leading-snug">{item.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Qty: {item.qty || 0}</span>
                              {assignedRackName && (
                                <span className={cn(
                                  "text-[9px] font-bold rounded px-1.5 py-0.5",
                                  isDirectTierAssigned 
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                )}>
                                  {isDirectTierAssigned ? "Placed here" : `Exists in: ${assignedRackName}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Interactive pills action */}
                        <span className={cn(
                          "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all",
                          isSelected 
                            ? "bg-blue-600 text-white" 
                            : "bg-slate-100 text-slate-400"
                        )}>
                          {isSelected ? 'SELECTED' : 'CLICK TO ADD'}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    No matching products discovered in inventory list.
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-slate-50 border-t border-[#F1F5F9] flex items-center justify-end gap-2.5">
                <button 
                  onClick={handleCancelAssign}
                  className="px-4 py-2.5 hover:bg-slate-150 text-[10px] font-bold text-slate-550 uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmAssign}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-md shadow-blue-50 active:scale-95"
                >
                  Confirm Selection
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Pop-Out Client Reservation Selection Modal Popup */}
      <AnimatePresence>
        {resAssignModal.open && selectedRack && resAssignModal.levelIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setResAssignModal({ open: false, levelIndex: null })} 
              className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
                <div>
                  <h3 className="font-bold text-slate-800 text-[11px] uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-600" />
                    <span>Assign Reserved Order to Level {resAssignModal.levelIndex + 1}</span>
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Structure: {selectedRack.name} • {selectedRack.zone}
                  </p>
                </div>
                <button 
                  onClick={() => setResAssignModal({ open: false, levelIndex: null })} 
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Informative Label Guidance */}
              <div className="px-5 pt-4">
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-100/60 text-amber-800 text-[10.5px] leading-relaxed font-semibold">
                  💡 Select which reserved client hold to pack onto Level {resAssignModal.levelIndex + 1}. Click any reservation order card to bind its physical position here.
                </div>
              </div>

              {/* Filtering input bar */}
              <div className="px-5 pt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search by Client Name or Order ID..."
                    value={resAssignSearch}
                    onChange={(e) => setResAssignSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-9 pr-4 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              {/* Scrollable multi-selection items list */}
              <div className="p-5 max-h-80 overflow-y-auto space-y-2">
                {reservations.filter(res => 
                  res.clientName.toLowerCase().includes(resAssignSearch.toLowerCase()) ||
                  res.orderId.toLowerCase().includes(resAssignSearch.toLowerCase()) ||
                  res.itemName.toLowerCase().includes(resAssignSearch.toLowerCase())
                ).length > 0 ? (
                  reservations.filter(res => 
                    res.clientName.toLowerCase().includes(resAssignSearch.toLowerCase()) ||
                    res.orderId.toLowerCase().includes(resAssignSearch.toLowerCase()) ||
                    res.itemName.toLowerCase().includes(resAssignSearch.toLowerCase())
                  ).map(res => {
                    const isPlacedHere = res.rackId === selectedRack.id && Number(res.rackLevel) === resAssignModal.levelIndex;
                    const assignedRackName = res.rackId ? (racks.find(r => r.id === res.rackId)?.name) : null;

                    return (
                      <div 
                        key={res.id}
                        onClick={() => handleAssignReservationToLevel(res.id, resAssignModal.levelIndex!)}
                        className={cn(
                          "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none active:scale-[0.99] hover:bg-slate-50",
                          isPlacedHere 
                            ? "border-amber-500 bg-amber-50/30 shadow-sm"
                            : "border-slate-100 bg-slate-50/40"
                        )}
                      >
                        <div className="flex items-center gap-3 truncate">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                          <div className="truncate">
                            <p className="text-xs font-extrabold text-amber-900 uppercase truncate leading-none mb-1">{res.orderId}</p>
                            <span className="text-[10px] text-slate-600 font-semibold block">{res.clientName}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-black text-amber-800 bg-amber-100 rounded px-1.5 py-0.5 font-bold">Qty: {res.qty} ({res.itemName})</span>
                              {assignedRackName && (
                                <span className={cn(
                                  "text-[9px] font-bold rounded px-1.5 py-0.5",
                                  isPlacedHere 
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-blue-100 text-blue-800"
                                )}>
                                  {isPlacedHere ? "Placed here" : `Exists in: ${assignedRackName}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1 shrink-0 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                          {isPlacedHere ? 'PLACED' : 'SELECT'}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    No matching reserves found.
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-[#F1F5F9] flex items-center justify-end">
                <button 
                  onClick={() => setResAssignModal({ open: false, levelIndex: null })}
                  className="px-5 py-2.5 hover:bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider rounded-xl transition-all"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

