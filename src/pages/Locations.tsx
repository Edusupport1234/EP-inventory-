import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid, Text, PivotControls, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/src/lib/utils';
import { 
  Plus, X, Package, Warehouse, Sliders, ChevronDown, ChevronUp, Layers, Info, Trash2, Edit3, MapPin, Check, Search, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Move, Minus 
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
    return { name: 'Zone 1', color: '#ef4444', label: 'Lane 5 (North End)', zCenter: -8 };
  } else if (z < -2) {
    return { name: 'Zone 2', color: '#f59e0b', label: 'Lane 4 (North Central)', zCenter: -4 };
  } else if (z < 2) {
    return { name: 'Zone 3', color: '#10b981', label: 'Lane 3 (Central Bay)', zCenter: 0 };
  } else if (z < 6) {
    return { name: 'Zone 4', color: '#3b82f6', label: 'Lane 2 (South Central)', zCenter: 4 };
  } else {
    return { name: 'Zone 5', color: '#8b5cf6', label: 'Lane 1 (South End)', zCenter: 8 };
  }
}

const LOCAL_ZONES = [
  { name: 'Zone 1', zCenter: -8, color: '#ef4444', label: 'LANE 5 • RED ZONE • NORTH END' },
  { name: 'Zone 2', zCenter: -4, color: '#f59e0b', label: 'LANE 4 • ORANGE ZONE • NORTH CENTRAL' },
  { name: 'Zone 3', zCenter: 0, color: '#10b981', label: 'LANE 3 • GREEN ZONE • CENTRAL BAY' },
  { name: 'Zone 4', zCenter: 4, color: '#3b82f6', label: 'LANE 2 • BLUE ZONE • SOUTH CENTRAL' },
  { name: 'Zone 5', zCenter: 8, color: '#8b5cf6', label: 'LANE 1 • PURPLE ZONE • SOUTH END' },
];

function Rack({ 
  rack, 
  inventory,
  reservations = [],
  onMove, 
  onSelect,
  selectedLevelIndex,
  onSelectLevel,
  selectedRackId,
  highlightedLevel,
  activeBoxPopup,
  onSetBoxPopup
}: { 
  rack: RackData, 
  inventory: any[],
  reservations: any[],
  onMove: (id: string, pos: [number, number, number]) => void,
  onSelect: (rack: RackData | null) => void,
  selectedLevelIndex: number | null,
  onSelectLevel: (levelIndex: number | null, rackObj?: RackData, openModal?: boolean) => void,
  selectedRackId: string | undefined,
  highlightedLevel: { rackId: string; levelIndex: number } | null,
  activeBoxPopup: any | null,
  onSetBoxPopup: (info: any | null) => void
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

  const renderRackContent = () => {
    return (
      <>
        {/* Rack Frame Wirebox highlighted with Zone color */}
        <mesh position={[0, H / 2, 0]} raycast={() => null}>
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
          const isHighlightedShelf = highlightedLevel?.rackId === rack.id && highlightedLevel?.levelIndex === i;
          return (
            <mesh 
              key={`shelf-${i}`} 
              position={[0, y, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(rack);
                onSelectLevel(null);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelect(rack);
                onSelectLevel(i, rack, true);
              }}
            >
              <boxGeometry args={[W - 0.1, 0.04, L - 0.05]} />
              <meshStandardMaterial 
                color={isHighlightedShelf ? "#10b981" : isSelectedShelf ? "#2563eb" : "#94a3b8"} 
                roughness={0.6} 
                emissive={isHighlightedShelf ? "#052e16" : "#000000"}
              />
            </mesh>
          );
        })}

        {/* Render Inventory items visually as boxes with in-scene popups */}
        {shelves.map((y, levelIndex) => {
          const levelItems = inventory.filter(item => item.rackId === rack.id && Number(item.rackLevel) === levelIndex);
          const levelRes = reservations.filter(r => r.rackId === rack.id && Number(r.rackLevel) === levelIndex);
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

            const isPopupActive = activeBoxPopup?.id === item.id && activeBoxPopup?.type === 'standard';

            return (
              <group key={`std-box-${item.id}-${boxIdx}`} position={[xPos, y + boxHeight / 2 + 0.02, 0]}>
                <mesh
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(rack);
                    onSelectLevel(levelIndex, rack, false); // select level but keep modal closed
                    onSetBoxPopup({
                      id: item.id,
                      name: item.name,
                      qty: item.qty || 0,
                      type: 'standard',
                      rackId: rack.id,
                      rackName: rack.name,
                      levelIndex: levelIndex
                    });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelect(rack);
                    onSelectLevel(levelIndex, rack, true); // open modal on double click
                  }}
                >
                  <boxGeometry args={[boxWidth, boxHeight, boxDepth]} />
                  <meshStandardMaterial 
                    color={boxColor} 
                    roughness={0.7} 
                    metalness={0.1} 
                    emissive={isPopupActive ? "#10b981" : "#000000"}
                    emissiveIntensity={isPopupActive ? 0.6 : 0.0}
                  />
                  {isPopupActive && (
                    <Edges 
                      color="#10b981" 
                      scale={1.05}
                      threshold={15}
                    />
                  )}
                </mesh>

                {isPopupActive && (
                  <Html distanceFactor={8} position={[0, boxHeight / 2, 0]} center zIndexRange={[100, 200]}>
                    <div className="relative bg-slate-900/95 text-white p-3 rounded-xl shadow-2xl border border-slate-700 min-w-[200px] pointer-events-auto backdrop-blur-md animate-in zoom-in-95 duration-150 select-none transform -translate-y-[calc(50%+14px)]">
                      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800">
                        <span className="text-[7.5px] font-black tracking-widest text-[#10b981] bg-emerald-950/65 px-1.5 py-0.5 rounded uppercase leading-none font-sans">Standard Item</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetBoxPopup(null);
                          }}
                          className="text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800 transition-all cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] font-black tracking-wide text-slate-100 uppercase mb-1 leading-snug">{item.name}</p>
                      <div className="space-y-0.5 text-[8.5px] text-slate-350 font-semibold">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Rack location:</span>
                          <span>{rack.name} (Tier {levelIndex + 1})</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black text-white pt-1">
                          <span>Available stock:</span>
                          <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold">{item.qty || 0} units</span>
                        </div>
                      </div>
                      {/* Speech bubble pointer */}
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-slate-700 rotate-45" />
                    </div>
                  </Html>
                )}
              </group>
            );
          });

          const reservationBoxes = levelRes.map((res, resIdx) => {
            const boxIdx = levelItems.length + resIdx;
            const ratio = totalBoxCount > 1 ? (boxIdx / (totalBoxCount - 1)) - 0.5 : 0;
            const xPos = ratio * (W - 0.8);

            const isPopupActive = activeBoxPopup?.id === res.id && activeBoxPopup?.type === 'reservation';

            return (
              <group key={`res-box-${res.id}-${resIdx}`} position={[xPos, y + boxHeight / 2 + 0.02, 0]}>
                <mesh
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(rack);
                    onSelectLevel(levelIndex, rack, false); // select level but keep modal closed
                    onSetBoxPopup({
                      id: res.id,
                      name: res.itemName,
                      qty: res.qty || 0,
                      type: 'reservation',
                      rackId: rack.id,
                      rackName: rack.name,
                      levelIndex: levelIndex,
                      clientName: res.clientName,
                      orderId: res.orderId
                    });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelect(rack);
                    onSelectLevel(levelIndex, rack, true); // open modal on double click
                  }}
                >
                  <boxGeometry args={[boxWidth * 1.05, boxHeight * 1.05, boxDepth * 1.05]} />
                  <meshStandardMaterial 
                    color="#f59e0b" 
                    roughness={0.3} 
                    metalness={0.7}
                    emissive={isPopupActive ? "#f59e0b" : "#000000"}
                    emissiveIntensity={isPopupActive ? 0.6 : 0.0}
                  />
                  {isPopupActive && (
                    <Edges 
                      color="#f59e0b" 
                      scale={1.05}
                      threshold={15}
                    />
                  )}
                </mesh>

                {isPopupActive && (
                  <Html distanceFactor={8} position={[0, boxHeight / 2, 0]} center zIndexRange={[100, 200]}>
                    <div className="relative bg-slate-900/95 text-white p-3 rounded-xl shadow-2xl border border-slate-700 min-w-[200px] pointer-events-auto backdrop-blur-md animate-in zoom-in-95 duration-150 select-none transform -translate-y-[calc(50%+14px)]">
                      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800">
                        <span className="text-[7.5px] font-black tracking-widest text-[#f59e0b] bg-amber-950/65 px-1.5 py-0.5 rounded uppercase leading-none font-sans font-bold">Reserved Hold</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetBoxPopup(null);
                          }}
                          className="text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800 transition-all cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] font-black tracking-wide text-slate-100 uppercase mb-0.5 leading-snug">{res.itemName}</p>
                      <p className="text-[8px] font-bold text-amber-400/90 tracking-wider uppercase mb-1 leading-none font-sans font-directed">To: {res.clientName}</p>
                      <div className="space-y-0.5 text-[8.5px] text-slate-350 font-semibold">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Order Ref:</span>
                          <span className="font-mono text-[7px] tracking-tight">{res.orderId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Rack location:</span>
                          <span>{rack.name} (Tier {levelIndex + 1})</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black text-white pt-1">
                          <span>Reserved hold:</span>
                          <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold">{res.qty || 0} units</span>
                        </div>
                      </div>
                      {/* Speech bubble pointer */}
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-slate-700 rotate-45" />
                    </div>
                  </Html>
                )}
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
      </>
    );
  };

  if (selectedRackId === rack.id) {
    return (
      <PivotControls 
        scale={1.5} 
        activeAxes={[true, false, true]} // Only move along horizontal floor layout
        disableRotations
        disableScaling
        onDrag={(matrix) => {
          const position = new THREE.Vector3();
          position.setFromMatrixPosition(matrix);
          onMove(rack.id, [position.x, 0, position.z]);
        }}
        visible={true}
        depthTest={false}
        matrix={new THREE.Matrix4().makeTranslation(rack.position[0], rack.position[1], rack.position[2])}
        autoTransform={false}
      >
        <group 
          onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} 
          onPointerOut={() => setHover(false)}
          onClick={(e) => { 
            e.stopPropagation(); 
            onSelect(rack); 
            onSelectLevel(null);
          }}
        >
          {renderRackContent()}

          {/* Visual indicator of the selected rack position without overhead overlay */}
        </group>
      </PivotControls>
    );
  }

  return (
    <group 
      position={rack.position}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} 
      onPointerOut={() => setHover(false)}
      onClick={(e) => { 
        e.stopPropagation(); 
        onSelect(rack); 
        onSelectLevel(null);
      }}
    >
      {renderRackContent()}
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
  selectedRackId,
  highlightedLevel,
  activeBoxPopup,
  onSetBoxPopup
}: { 
  racks: RackData[], 
  inventory: any[],
  reservations: any[],
  onMoveRack: (id: string, pos: [number, number, number]) => void,
  onSelectRack: (rack: RackData | null) => void,
  selectedLevelIndex: number | null,
  onSelectLevel: (levelIndex: number | null, rackObj?: RackData, openModal?: boolean) => void,
  selectedRackId: string | undefined,
  highlightedLevel: { rackId: string; levelIndex: number } | null,
  activeBoxPopup: any | null,
  onSetBoxPopup: (info: any | null) => void
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
      {LOCAL_ZONES.map((zone) => {
        const laneNumber = zone.name === 'Zone 1' ? 'LANE 5' : 
                           zone.name === 'Zone 2' ? 'LANE 4' :
                           zone.name === 'Zone 3' ? 'LANE 3' :
                           zone.name === 'Zone 4' ? 'LANE 2' : 'LANE 1';
        return (
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
            
            {/* Quick-glance Lane Numbers flat on floor on both sides */}
            <Text
              position={[-9, 0.015, zone.zCenter]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.65}
              color={zone.color}
              fontWeight="black"
              fillOpacity={0.35}
            >
              {laneNumber}
            </Text>
            <Text
              position={[9, 0.015, zone.zCenter]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.65}
              color={zone.color}
              fontWeight="black"
              fillOpacity={0.35}
            >
              {laneNumber}
            </Text>
            
            {/* Label lines at extreme boundaries */}
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
        );
      })}

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
          highlightedLevel={highlightedLevel}
          activeBoxPopup={activeBoxPopup}
          onSetBoxPopup={onSetBoxPopup}
        />
      ))}

      {/* Floor plan standard layout mesh with deselection trigger */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.01, 0]} 
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelectRack(null);
          onSelectLevel(null);
          onSetBoxPopup(null);
        }}
      >
        <planeGeometry args={[500, 500]} />
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

  // Pop-out level details state
  interface LevelPopoutState {
    open: boolean;
    rack: RackData | null;
    levelIndex: number | null;
  }
  const [levelPopout, setLevelPopout] = useState<LevelPopoutState>({
    open: false,
    rack: null,
    levelIndex: null
  });

  // State inside levelPopout for adding item to level
  const [isAddingToLevel, setIsAddingToLevel] = useState(false);
  const [addingLevelSearch, setAddingLevelSearch] = useState('');
  
  // Prompting state inside level add popup for item quantity allocation
  const [selectedItemToAlloc, setSelectedItemToAlloc] = useState<any | null>(null);
  const [allocQtyInput, setAllocQtyInput] = useState('1');

  // Overall Global locator search variables
  const [overallSearchVal, setOverallSearchVal] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [locatorResult, setLocatorResult] = useState<{
    success: boolean;
    message: string;
    item: any | null;
  } | null>(null);

  // Highlighting level state for shelf locator
  const [highlightedLevel, setHighlightedLevel] = useState<{ rackId: string; levelIndex: number } | null>(null);

  // Active box clicked details popup state in the 3D canvas
  const [activeBoxPopup, setActiveBoxPopup] = useState<{
    id: string;
    name: string;
    qty: number;
    type: 'standard' | 'reservation';
    rackId: string;
    rackName: string;
    levelIndex: number;
    clientName?: string;
    orderId?: string;
  } | null>(null);

  // Allocation confirmation with quantity prompt custom UI step
  const handleConfirmAllocationQty = async () => {
    if (!levelPopout.rack || levelPopout.levelIndex === null || !selectedItemToAlloc) return;
    const qtyNum = parseInt(allocQtyInput) || 0;
    
    try {
      // 1. Update Firestore
      await updateDoc(doc(db, 'inventory', selectedItemToAlloc.id), {
        rackId: levelPopout.rack.id,
        rackLevel: levelPopout.levelIndex,
        qty: qtyNum
      });

      // 2. Update RTDB for synchronization
      try {
        await update(ref(rtdb, `inventory/${selectedItemToAlloc.id}`), {
          rackId: levelPopout.rack.id,
          rackLevel: levelPopout.levelIndex,
          qty: qtyNum
        });
      } catch (err_rtdb) {
        console.warn("RTDB sync skipped: ", err_rtdb);
      }

      // Reset nested statuses
      setSelectedItemToAlloc(null);
      setAllocQtyInput('1');
      setIsAddingToLevel(false);

      // Refresh popout info
      const freshRack = racks.find(r => r.id === levelPopout.rack?.id);
      setLevelPopout(prev => ({
        ...prev,
        rack: freshRack || prev.rack
      }));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'inventory');
    }
  };

  const locateSelectedItem = (item: any) => {
    if (!item.rackId || item.rackLevel === undefined || item.rackLevel === -1) {
      setLocatorResult({
        success: false,
        message: `Stock "${item.name}" exists but is not currently allocated to any rack level.`,
        item: item
      });
      setHighlightedLevel(null);
      return;
    }

    const foundRack = racks.find(r => r.id === item.rackId);
    if (!foundRack) {
      setLocatorResult({
        success: false,
        message: `Stock "${item.name}" is assigned to an unlisted/purged rack structure.`,
        item: item
      });
      setHighlightedLevel(null);
      return;
    }

    // Set structure active
    setSelectedRack(foundRack);
    setSelectedLevelIndex(Number(item.rackLevel));
    
    // Set highlighted state so 3D and 2D components can draw extreme visual attention
    setHighlightedLevel({
      rackId: foundRack.id,
      levelIndex: Number(item.rackLevel)
    });

    setLocatorResult({
      success: true,
      message: `Stock located in ${foundRack.name} at Level ${Number(item.rackLevel) + 1}.`,
      item: item
    });
  };

  const executeSearchLocator = () => {
    if (!overallSearchVal.trim()) return;
    const match = inventory.find(item => item.name.toLowerCase() === overallSearchVal.toLowerCase().trim());
    if (match) {
      locateSelectedItem(match);
    } else {
      // try substring
      const subMatch = inventory.find(item => item.name.toLowerCase().includes(overallSearchVal.toLowerCase().trim()));
      if (subMatch) {
        locateSelectedItem(subMatch);
      } else {
        setLocatorResult({
          success: false,
          message: `Could not discover any inventory stock named "${overallSearchVal}".`,
          item: null
        });
        setHighlightedLevel(null);
      }
    }
  };

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

  // Listen for external pending highlights (e.g. from Dashboard search redirection)
  useEffect(() => {
    if (inventory.length === 0 || racks.length === 0) return;
    const pendingLocateId = localStorage.getItem('locateStockItemId');
    const pendingLocateName = localStorage.getItem('locateStockName');

    if (pendingLocateId) {
      const match = inventory.find(item => item.id === pendingLocateId);
      if (match) {
        locateSelectedItem(match);
        // Clear immediately so it runs only once per redirect
        localStorage.removeItem('locateStockItemId');
        localStorage.removeItem('locateStockName');
        return;
      }
    }
    if (pendingLocateName) {
      const match = inventory.find(item => item.name.toLowerCase() === pendingLocateName.toLowerCase());
      if (match) {
        locateSelectedItem(match);
        // Clear immediately
        localStorage.removeItem('locateStockItemId');
        localStorage.removeItem('locateStockName');
      }
    }
  }, [inventory, racks]);

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
    setSelectedRack(prev => prev && prev.id === id ? { ...prev, position: newPos, zone: computedZone } : prev);
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
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Location Matrix</h1>
            <p className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">Warehouse Floor Map & Configuration</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={addRack}
              className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg active:scale-95 transition-all shadow-md shrink-0 uppercase tracking-widest"
            >
              + ADD NEW RACK
            </button>
          </div>
        </header>

        {/* Dynamic Item Locator Search Bar */}
        <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#EDE7DF] flex flex-col sm:flex-row gap-3 items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="bg-[#EBE3D5] p-2 rounded-lg text-amber-900">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Stock Locator</p>
              <p className="text-[9px] text-[#8C8273] font-bold uppercase tracking-widest mt-0.5">Find physical shelf placement instantly</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-80 shrink-0 relative">
            <input 
              type="text"
              placeholder="Search Stock Name..."
              value={overallSearchVal}
              onChange={(e) => {
                setOverallSearchVal(e.target.value);
                setShowSearchDropdown(true);
              }}
              className="w-full bg-white border border-[#E2D8C9] rounded-lg py-2 pl-3 pr-10 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 shadow-sm"
            />
            <button 
              onClick={executeSearchLocator}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all active:scale-95 shadow-xs"
              title="Locate Item"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            
            {/* Predictive autocomplete dropdown */}
            {showSearchDropdown && overallSearchVal.trim() && (
              <div className="absolute top-11 left-0 right-0 max-h-48 overflow-y-auto bg-white border border-[#EDE7DF] rounded-xl shadow-xl z-20 space-y-1 p-2">
                {inventory.filter(item => 
                  item.name.toLowerCase().includes(overallSearchVal.toLowerCase())
                ).length > 0 ? (
                  inventory.filter(item => 
                    item.name.toLowerCase().includes(overallSearchVal.toLowerCase())
                  ).map((item, idx) => (
                    <div 
                      key={`locator-match-${item.id}-${idx}`}
                      onClick={() => {
                        setOverallSearchVal(item.name);
                        setShowSearchDropdown(false);
                        locateSelectedItem(item);
                      }}
                      className="p-2 hover:bg-slate-55 rounded-lg text-xs font-bold text-slate-700 cursor-pointer flex justify-between items-center bg-slate-50/50 hover:bg-slate-100/75"
                    >
                      <span className="truncate pr-2">{item.name}</span>
                      <span className={cn(
                        "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border leading-none shrink-0",
                        item.rackId ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-100 border-slate-200 text-slate-400"
                      )}>
                        {item.rackId ? "Allocated" : "Unplaced"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-[10px] text-slate-450 italic">No matches discovered</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Highlight overlay */}
        {locatorResult && (
          <div className={cn(
            "p-3 rounded-xl border text-[10.5px] font-bold uppercase tracking-wider flex items-center justify-between gap-2.5 animate-in fade-in duration-200 shrink-0",
            locatorResult.success ? "bg-emerald-55 border-emerald-200 text-emerald-800 bg-emerald-50" : "bg-amber-50 border-amber-200 text-amber-800"
          )}>
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", locatorResult.success ? "bg-emerald-600 animate-pulse" : "bg-amber-500")} />
              <span>{locatorResult.message}</span>
            </div>
            <button 
              onClick={() => {
                setLocatorResult(null);
                setHighlightedLevel(null);
              }}
              className="p-1 hover:bg-slate-200/50 rounded-lg text-slate-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 3D Visualizer Render Port */}
        <div className="flex-1 bg-slate-900 rounded-[20px] overflow-hidden border border-slate-800 shadow-inner relative group min-h-[350px]">
          <Canvas 
            shadows
          >
            <WarehouseScene 
              racks={racks} 
              inventory={inventory}
              reservations={reservations}
              onMoveRack={onMoveRack} 
              onSelectRack={(rk) => {
                setSelectedRack(rk);
                setHighlightedLevel(null);
                if (rk === null) {
                  setSelectedLevelIndex(null);
                  setLevelPopout({ open: false, rack: null, levelIndex: null });
                }
              }} 
              selectedLevelIndex={selectedLevelIndex}
              onSelectLevel={(levelIdx, rk, openModal = true) => {
                setSelectedLevelIndex(levelIdx);
                const activeRk = rk || selectedRack;
                if (activeRk) {
                  setSelectedRack(activeRk);
                }
                if (levelIdx !== null && activeRk && openModal) {
                  setLevelPopout({
                    open: true,
                    rack: activeRk,
                    levelIndex: levelIdx
                  });
                }
              }}
              selectedRackId={selectedRack?.id}
              highlightedLevel={highlightedLevel}
              activeBoxPopup={activeBoxPopup}
              onSetBoxPopup={setActiveBoxPopup}
            />
          </Canvas>

          {/* Helper Legend Panel overlay */}
          <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
             <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 shadow-sm text-slate-800">
                <p className="text-[7.5px] text-slate-400 font-extrabold uppercase tracking-widest">ACTION</p>
                <p className="text-[9.5px] font-bold text-slate-700">Drag Pivot Guides to Reposition</p>
             </div>
             <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 shadow-sm text-slate-800">
                <p className="text-[7.5px] text-slate-400 font-extrabold uppercase tracking-widest">DISCOVER</p>
                <p className="text-[9.5px] font-bold text-slate-700">Click shelves or rows to inspect</p>
             </div>
          </div>

          {/* Active Rack Quick Positioning Dashboard Overlay */}
          <AnimatePresence>
            {selectedRack && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.15 }}
                className="absolute right-4 top-4 bg-white/95 backdrop-blur border border-slate-200/80 p-4 rounded-2xl shadow-xl w-64 text-slate-805 flex flex-col gap-3.5 z-10"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-105 p-2 rounded-xl text-blue-600 shadow-3xs">
                      <Move className="w-4 h-4 animate-pulse shrink-0" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest leading-none">SPATIAL DECK</h4>
                      <p className="text-xs font-black text-slate-800 mt-1.5 font-mono">{selectedRack.name}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRack(null);
                      setSelectedLevelIndex(null);
                      setHighlightedLevel(null);
                      setActiveBoxPopup(null);
                      setLevelPopout({ open: false, rack: null, levelIndex: null });
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition-all cursor-pointer shadow-3xs"
                    title="Deselect Rack"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-3.5">
                  {/* Coordinates view */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-[7.5px] font-black uppercase text-slate-400">Coord X</span>
                      <span className="font-mono text-[10px] font-extrabold text-blue-600 mt-0.5">{selectedRack.position[0].toFixed(1)}m</span>
                    </div>
                    <div className="flex flex-col items-center border-l border-slate-150">
                      <span className="text-[7.5px] font-black uppercase text-slate-400">Coord Z</span>
                      <span className="font-mono text-[10px] font-extrabold text-indigo-700 mt-0.5">{selectedRack.position[2].toFixed(1)}m</span>
                    </div>
                  </div>

                  {/* Ground Position Controls */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Flat Ground</span>
                    <div className="grid grid-cols-3 gap-1.5 w-28">
                      <div />
                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0], selectedRack.position[1], selectedRack.position[2] - 0.5])}
                        className="w-8.5 h-8.5 bg-slate-50 hover:bg-blue-605 border border-slate-205 hover:border-blue-500 rounded-xl flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-3xs hover:shadow active:scale-90"
                        title="Nudge North (W / Up)"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <div />

                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0] - 0.5, selectedRack.position[1], selectedRack.position[2]])}
                        className="w-8.5 h-8.5 bg-slate-50 hover:bg-blue-605 border border-slate-205 hover:border-blue-500 rounded-xl flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-3xs hover:shadow active:scale-90"
                        title="Nudge West (A / Left)"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      
                      <div className="w-8.5 h-8.5 bg-blue-50 border border-blue-100 rounded-xl flex flex-col items-center justify-center select-none text-[6px] font-black text-blue-500 leading-none">
                        <span>XZ</span>
                        <span className="text-[7px] text-blue-600 font-mono mt-0.5 font-bold">0.5m</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0] + 0.5, selectedRack.position[1], selectedRack.position[2]])}
                        className="w-8.5 h-8.5 bg-slate-50 hover:bg-blue-605 border border-slate-205 hover:border-blue-500 rounded-xl flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-3xs hover:shadow active:scale-90"
                        title="Nudge East (D / Right)"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <div />
                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0], selectedRack.position[1], selectedRack.position[2] + 0.5])}
                        className="w-8.5 h-8.5 bg-slate-50 hover:bg-blue-605 border border-slate-205 hover:border-blue-500 rounded-xl flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-3xs hover:shadow active:scale-90"
                        title="Nudge South (S / Down)"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <div />
                    </div>
                  </div>

                  <p className="border-t border-slate-100 pt-2 text-[7.5px] text-slate-400 text-center uppercase tracking-wider font-extrabold w-full">
                    WASD or Arrow keys supported
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Sidebar - Properties & Level Content Sub-layers */}
      <aside className="w-full lg:w-96 bg-white border border-slate-200 rounded-lg flex flex-col p-5 shadow-sm overflow-y-auto">
        <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            <span>Rack Console</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded",
              selectedRack ? "bg-blue-100 text-blue-700 font-bold" : "bg-slate-100 text-slate-400 font-normal"
            )}>
              {selectedRack ? 'Active' : 'Unselected'}
            </span>
          </div>
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
                    <option value="Zone 5">Lane 1 (Purple • South End)</option>
                    <option value="Zone 4">Lane 2 (Blue • South Central)</option>
                    <option value="Zone 3">Lane 3 (Green • Central Bay)</option>
                    <option value="Zone 2">Lane 4 (Orange • North Central)</option>
                    <option value="Zone 1">Lane 5 (Red • North End)</option>
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

            {/* Informational keyboard positioning tip */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-150 text-[9.5px] text-slate-500 leading-snug">
              💡 <strong className="font-extrabold text-slate-700">Pro-Tip:</strong> Click the rack structure in the 3D scene, then use keyboard hotkeys <kbd className="bg-white border border-slate-250 rounded px-1 font-mono text-[9px] text-slate-700 shadow-3xs">W</kbd> <kbd className="bg-white border border-slate-250 rounded px-1 font-mono text-[9px] text-slate-700 shadow-3xs">A</kbd> <kbd className="bg-white border border-slate-250 rounded px-1 font-mono text-[9px] text-slate-700 shadow-3xs">S</kbd> <kbd className="bg-white border border-slate-250 rounded px-1 font-mono text-[9px] text-slate-700 shadow-3xs">D</kbd> and <kbd className="bg-white border border-slate-250 rounded px-1 font-mono text-[9px] text-slate-700 shadow-3xs">Q</kbd> / <kbd className="bg-white border border-slate-250 rounded px-1 font-mono text-[9px] text-slate-700 shadow-3xs">E</kbd> for rapid precision alignment. Hold <kbd className="bg-white border border-slate-250 rounded px-1 font-mono text-[9px] text-slate-700 shadow-3xs">Shift</kbd> for 1.0m strides!
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
                        highlightedLevel?.rackId === selectedRack.id && highlightedLevel?.levelIndex === levelIdx 
                          ? "border-emerald-500 bg-emerald-50/20 shadow-md ring-2 ring-emerald-400/50 animate-pulse" 
                          : isExpanded 
                            ? "border-blue-500 bg-blue-50/10 shadow-sm" 
                            : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
                      )}
                    >
                      {/* Collapsible level header row */}
                      <div 
                        onClick={() => {
                          setSelectedLevelIndex(isExpanded ? null : levelIdx);
                          setLevelPopout({
                            open: true,
                            rack: selectedRack,
                            levelIndex: levelIdx
                          });
                        }}
                        onDoubleClick={() => {
                          setLevelPopout({
                            open: true,
                            rack: selectedRack,
                            levelIndex: levelIdx
                          });
                        }}
                        className="p-3 flex items-center justify-between cursor-pointer text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors select-none"
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
                                  <div 
                                    key={item.id ? `rack-item-${item.id}-${idx}` : `rack-item-idx-${idx}`} 
                                    onClick={() => {
                                      setLevelPopout({
                                        open: true,
                                        rack: selectedRack,
                                        levelIndex: levelIdx
                                      });
                                    }}
                                    onDoubleClick={() => {
                                      setLevelPopout({
                                        open: true,
                                        rack: selectedRack,
                                        levelIndex: levelIdx
                                      });
                                    }}
                                    className="flex items-center justify-between bg-slate-50 hover:bg-slate-100/80 p-2 rounded border border-slate-100 cursor-pointer transition-colors"
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: boxColor }} />
                                      <p className="text-[11px] font-bold text-slate-800 uppercase truncate leading-snug">{item.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Qty: {item.qty}</span>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUnassignItem(item.id);
                                        }}
                                        className="text-slate-455 hover:text-rose-605 p-1 hover:bg-slate-200/50 rounded duration-100 shrink-0"
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
                                <div 
                                  key={res.id ? `rack-res-${res.id}-${idx}` : `rack-res-idx-${idx}`} 
                                  onClick={() => {
                                    setLevelPopout({
                                      open: true,
                                      rack: selectedRack,
                                      levelIndex: levelIdx
                                    });
                                  }}
                                  onDoubleClick={() => {
                                    setLevelPopout({
                                      open: true,
                                      rack: selectedRack,
                                      levelIndex: levelIdx
                                    });
                                  }}
                                  className="flex items-center justify-between bg-amber-50/50 hover:bg-amber-100/50 p-2 rounded border border-amber-100 cursor-pointer transition-colors"
                                >
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
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnassignReservation(res.id);
                                      }}
                                      className="text-amber-500 hover:text-rose-600 p-1 hover:bg-amber-150 rounded"
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
                  ).map((item, idx) => {
                    const isSelected = tempSelectedIds.includes(item.id);
                    const assignedRackName = item.rackId ? (racks.find(r => r.id === item.rackId)?.name) : null;
                    const isDirectTierAssigned = item.rackId === selectedRack.id && Number(item.rackLevel) === assignModal.levelIndex;

                    // Color code calculated same way as standard boxes
                    const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                    const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
                    const boxColor = colors[hash % colors.length];

                    return (
                      <div 
                        key={`allocate-${item.id}-${idx}`}
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
                  ).map((res, idx) => {
                    const isPlacedHere = res.rackId === selectedRack.id && Number(res.rackLevel) === resAssignModal.levelIndex;
                    const assignedRackName = res.rackId ? (racks.find(r => r.id === res.rackId)?.name) : null;

                    return (
                      <div 
                        key={`appoint-${res.id}-${idx}`}
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

      {/* Level details Pop-Out Modal with nested Add steps and custom quantity allocation */}
      <AnimatePresence>
        {levelPopout.open && levelPopout.rack && levelPopout.levelIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => {
                setLevelPopout({ open: false, rack: null, levelIndex: null });
                setIsAddingToLevel(false);
                setSelectedItemToAlloc(null);
                setAllocQtyInput('1');
              }} 
              className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }} 
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
                <div>
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600 animate-pulse" />
                    <span>Level {levelPopout.levelIndex + 1} Deck Details</span>
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Structure: {levelPopout.rack.name} • Zone: {levelPopout.rack.zone}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setLevelPopout({ open: false, rack: null, levelIndex: null });
                    setIsAddingToLevel(false);
                    setSelectedItemToAlloc(null);
                    setAllocQtyInput('1');
                  }} 
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-lg animate-fade-in"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {!isAddingToLevel ? (
                  <>
                    {/* View mode: Displays contents of this specific level */}
                    <div className="space-y-3">
                      <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Currently Loaded Inventory</div>
                      {inventory.filter(item => item.rackId === levelPopout.rack?.id && Number(item.rackLevel) === levelPopout.levelIndex).length > 0 ? (
                        <div className="space-y-2">
                          {inventory.filter(item => item.rackId === levelPopout.rack?.id && Number(item.rackLevel) === levelPopout.levelIndex).map((item, idx) => {
                            const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                            const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
                            const boxColor = colors[hash % colors.length];

                            return (
                              <div key={`popout-item-${item.id}-${idx}`} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50">
                                <div className="flex items-center gap-2 truncate">
                                  <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: boxColor }} />
                                  <span className="text-xs font-bold text-slate-800 uppercase truncate leading-none">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-bold">Qty: {item.qty}</span>
                                  <button 
                                    onClick={() => handleUnassignItem(item.id)}
                                    className="p-1 hover:bg-[#FFEBEB] text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                    title="Unassign Item"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">No standard inventory items allocated here.</div>
                      )}
                    </div>

                    {/* Reservations loaded */}
                    <div className="space-y-3">
                      <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Active Hold Reservations</div>
                      {reservations.filter(res => res.rackId === levelPopout.rack?.id && Number(res.rackLevel) === levelPopout.levelIndex).length > 0 ? (
                        <div className="space-y-2">
                          {reservations.filter(res => res.rackId === levelPopout.rack?.id && Number(res.rackLevel) === levelPopout.levelIndex).map((res, idx) => (
                            <div key={`popout-res-${res.id}-${idx}`} className="flex items-center justify-between p-2.5 rounded-xl border border-amber-200 bg-amber-50/20">
                              <div className="flex items-center gap-2 truncate">
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                <div className="truncate">
                                  <span className="text-xs font-bold text-slate-800 block truncate leading-none">{res.orderId}</span>
                                  <span className="text-[10px] text-slate-500 block leading-tight mt-1">{res.clientName}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-black text-amber-850 bg-amber-100 px-2 py-0.5 rounded-full font-bold">Res: {res.qty} ({res.itemName})</span>
                                <button 
                                  onClick={() => handleUnassignReservation(res.id)}
                                  className="p-1 hover:bg-[#FFEBEB] text-slate-450 hover:text-rose-600 rounded-lg transition-colors"
                                  title="Unassign Reservation"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">No reservation client orders loaded here.</div>
                      )}
                    </div>

                    {/* Big Button ADD */}
                    <button
                      onClick={() => {
                        setIsAddingToLevel(true);
                        setAddingLevelSearch('');
                      }}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 mt-2"
                    >
                      <Plus className="w-4 h-4 stroke-[3px]" />
                      <span>Add</span>
                    </button>
                  </>
                ) : (
                  <>
                    {/* Add Mode: Steps */}
                    {!selectedItemToAlloc ? (
                      <div className="space-y-4 animate-in slide-in-from-right duration-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest">Select Stock Item</span>
                          <button 
                            onClick={() => setIsAddingToLevel(false)}
                            className="text-xs font-black text-slate-500 hover:text-slate-800 uppercase"
                          >
                            Back
                          </button>
                        </div>

                        {/* Search Input Filter */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="Find product by name..."
                            value={addingLevelSearch}
                            onChange={(e) => setAddingLevelSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-colors"
                          />
                        </div>

                        {/* List Items present */}
                        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                          {inventory.filter(item => 
                            item.name.toLowerCase().includes(addingLevelSearch.toLowerCase())
                          ).length > 0 ? (
                            inventory.filter(item => 
                              item.name.toLowerCase().includes(addingLevelSearch.toLowerCase())
                            ).map((item, idx) => {
                              const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                              const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
                              const boxColor = colors[hash % colors.length];
                              const locatedRack = item.rackId ? (racks.find(r => r.id === item.rackId)?.name) : null;

                              return (
                                <div 
                                  key={`alloc-list-${item.id}-${idx}`}
                                  onClick={() => {
                                    setSelectedItemToAlloc(item);
                                    setAllocQtyInput(String(item.qty || 1));
                                  }}
                                  className="p-3 rounded-xl border border-slate-100 hover:border-blue-400 bg-slate-50/40 hover:bg-slate-50 cursor-pointer transition-all flex justify-between items-center"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: boxColor }} />
                                    <span className="text-xs font-bold text-slate-800 uppercase truncate pr-2">{item.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {locatedRack && (
                                      <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded select-none">
                                        At: {locatedRack}
                                      </span>
                                    )}
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest pl-2">Select</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="py-6 text-center text-xs text-slate-450 italic">No matching products found.</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Prompting allocated stocks quantity */
                      <div className="space-y-4 animate-in slide-in-from-right duration-200">
                        <div>
                          <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-widest block">Allocate Storage Volume</span>
                          <span className="text-xs font-black text-slate-800 uppercase mt-0.5 block leading-tight">Product: {selectedItemToAlloc.name}</span>
                        </div>

                        <div className="space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-150">
                          <label className="text-[9px] font-black uppercase text-slate-500 block leading-none mb-1.5">Number of Stocks to Locate</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const currentVal = parseInt(allocQtyInput) || 1;
                                if (currentVal > 1) {
                                  setAllocQtyInput(String(currentVal - 1));
                                }
                              }}
                              className="w-10 h-10 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-all active:scale-95 shadow-sm"
                            >
                              <Minus className="w-3.5 h-3.5 stroke-[3px]" />
                            </button>

                            <input 
                              type="number"
                              min="1"
                              value={allocQtyInput}
                              onChange={(e) => setAllocQtyInput(e.target.value)}
                              className="w-full text-center border border-slate-200 rounded-xl h-10 px-3 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white shadow-xs bg-white"
                              placeholder="Quantity"
                            />

                            <button
                              type="button"
                              onClick={() => {
                                const currentVal = parseInt(allocQtyInput) || 0;
                                setAllocQtyInput(String(currentVal + 1));
                              }}
                              className="w-10 h-10 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-all active:scale-95 shadow-sm"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                            </button>
                          </div>
                        </div>

                        {/* Confirmation Buttons */}
                        <div className="flex items-center gap-2.5 pt-2">
                          <button 
                            onClick={() => setSelectedItemToAlloc(null)}
                            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all text-slate-600"
                          >
                            Back To SKU list
                          </button>
                          <button 
                            onClick={handleConfirmAllocationQty}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all shadow-md active:scale-95"
                          >
                            Confirm Allocation
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Close footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
                <button 
                  onClick={() => {
                    setLevelPopout({ open: false, rack: null, levelIndex: null });
                    setIsAddingToLevel(false);
                    setSelectedItemToAlloc(null);
                    setAllocQtyInput('1');
                  }}
                  className="px-4 py-2 hover:bg-slate-150 text-[10px] font-bold text-slate-500 uppercase tracking-widest rounded-lg transition-all"
                >
                  Close Detail Panel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

