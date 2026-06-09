import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid, Text, PivotControls, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/src/lib/utils';
import { 
  Plus, X, Package, Warehouse, Sliders, ChevronDown, ChevronUp, Layers, Info, Trash2, Edit3, MapPin, Check, Search, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Move, Minus, Maximize2, Minimize2, Layout
} from 'lucide-react';
import { db, collection, addDoc, onSnapshot, updateDoc, doc, query, handleFirestoreError, OperationType, auth, deleteDoc, rtdb, ref, update } from '@/src/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';

import { writeBatch, setDoc } from 'firebase/firestore';
import { checkViewerAndAlert } from '@/src/lib/auth-alert';

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

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  rackId?: string;
  rackLevel?: number;
}

export interface Reservation {
  id: string;
  clientName: string;
  orderId: string;
  itemName: string;
  qty: number;
  rackId?: string;
  rackLevel?: number;
}

export interface LevelPopoutState {
  open: boolean;
  rack: RackData | null;
  levelIndex: number | null;
}

export interface ZoneInfo {
  name: string;
  color: string;
  label: string;
  zCenter: number;
  lane: string;
}

export const PHYSICAL_ZONES: ZoneInfo[] = [
  { name: 'Zone 1', color: '#ef4444', label: 'LANE 5 • RED ZONE • NORTH END', zCenter: -8, lane: 'LANE 5' },
  { name: 'Zone 2', color: '#f59e0b', label: 'LANE 4 • ORANGE ZONE • NORTH CENTRAL', zCenter: -4, lane: 'LANE 4' },
  { name: 'Zone 3', color: '#10b981', label: 'LANE 3 • GREEN ZONE • CENTRAL BAY', zCenter: 0, lane: 'LANE 3' },
  { name: 'Zone 4', color: '#3b82f6', label: 'LANE 2 • BLUE ZONE • SOUTH CENTRAL', zCenter: 4, lane: 'LANE 2' },
  { name: 'Zone 5', color: '#8b5cf6', label: 'LANE 1 • PURPLE ZONE • SOUTH END', zCenter: 8, lane: 'LANE 1' },
];

export function getZoneByZ(z: number): ZoneInfo {
  if (z < -6) {
    return PHYSICAL_ZONES[0];
  } else if (z < -2) {
    return PHYSICAL_ZONES[1];
  } else if (z < 2) {
    return PHYSICAL_ZONES[2];
  } else if (z < 6) {
    return PHYSICAL_ZONES[3];
  } else {
    return PHYSICAL_ZONES[4];
  }
}

export function checkRackOverlap(
  posA: [number, number, number],
  wA: number,
  lA: number,
  posB: [number, number, number],
  wB: number,
  lB: number
): boolean {
  const halfWa = wA / 2;
  const halfLa = lA / 2;
  const halfWb = wB / 2;
  const halfLb = lB / 2;

  const minX_A = posA[0] - halfWa, maxX_A = posA[0] + halfWa;
  const minZ_A = posA[2] - halfLa, maxZ_A = posA[2] + halfLa;

  const minX_B = posB[0] - halfWb, maxX_B = posB[0] + halfWb;
  const minZ_B = posB[2] - halfLb, maxZ_B = posB[2] + halfLb;

  const overlapX = Math.min(maxX_A, maxX_B) > Math.max(minX_A, minX_B);
  const overlapZ = Math.min(maxZ_A, maxZ_B) > Math.max(minZ_A, minZ_B);

  return overlapX && overlapZ;
}

export interface SketchItem {
  id: string;
  type: 'wall' | 'window' | 'door' | 'toilet_bowl';
  position: [number, number, number];
  size: [number, number, number]; // [width, height, thickness]
  rotation: number; // Y-rotation angle in radians
  color?: string;
  name?: string;
}

function SketchItemMesh({
  item,
  selectedSketchItemId,
  onSelect,
  onDoubleClick
}: {
  item: SketchItem;
  selectedSketchItemId: string | undefined;
  onSelect: (item: SketchItem) => void;
  onDoubleClick: (item: SketchItem) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedSketchItemId === item.id;

  const width = item.size[0] || 2;
  const height = item.size[1] || 2.5;
  const depth = item.size[2] || 0.2;

  const renderContent = () => {
    if (item.type === 'wall') {
      return (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial 
            color={isSelected ? '#3b82f6' : (hovered ? '#cbd5e1' : item.color || '#e2e8f0')} 
            roughness={0.85}
            metalness={0.1}
          />
        </mesh>
      );
    } else if (item.type === 'window') {
      return (
        <group>
          {/* Frame */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial color={isSelected ? '#3b82f6' : '#475569'} roughness={0.4} metalness={0.5} />
          </mesh>
          {/* Glass */}
          <mesh scale={[0.88, 0.75, 1.15]}>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial 
              color="#38bdf8" 
              transparent 
              opacity={0.4} 
              roughness={0.1} 
              metalness={0.9} 
            />
          </mesh>
        </group>
      );
    } else if (item.type === 'toilet_bowl') {
      return (
        <group>
          {/* Base / Pedestal */}
          <mesh castShadow receiveShadow position={[0, -0.25, 0.05]}>
            <cylinderGeometry args={[0.18, 0.22, 0.3, 16]} />
            <meshStandardMaterial 
              color={isSelected ? '#3b82f6' : (hovered ? '#f1f5f9' : '#f8fafc')} 
              roughness={0.1} 
              metalness={0.05} 
            />
          </mesh>
          {/* Main Bowl */}
          <mesh castShadow receiveShadow position={[0, -0.05, 0.1]}>
            <cylinderGeometry args={[0.24, 0.18, 0.2, 16]} />
            <meshStandardMaterial 
              color={isSelected ? '#3b82f6' : (hovered ? '#e2e8f0' : '#cbd5e1')} 
              roughness={0.15} 
              metalness={0.05} 
            />
          </mesh>
          {/* Ceramic Seat Rim */}
          <mesh castShadow receiveShadow position={[0, 0.06, 0.1]}>
            <boxGeometry args={[0.42, 0.04, 0.52]} />
            <meshStandardMaterial 
              color={isSelected ? '#3b82f6' : (hovered ? '#cbd5e1' : '#e2e8f0')} 
              roughness={0.2} 
            />
          </mesh>
          {/* Water Tank */}
          <mesh castShadow receiveShadow position={[0, 0.1, -0.16]}>
            <boxGeometry args={[0.46, 0.5, 0.2]} />
            <meshStandardMaterial 
              color={isSelected ? '#3b82f6' : (hovered ? '#f1f5f9' : '#f8fafc')} 
              roughness={0.1} 
              metalness={0.05} 
            />
          </mesh>
          {/* Flush Buttons */}
          <mesh position={[0.1, 0.36, -0.16]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 8]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      );
    } else {
      // Door
      return (
        <group>
          {/* Frame */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial color={isSelected ? '#2563eb' : '#451a03'} roughness={0.7} />
          </mesh>
          {/* Panel */}
          <mesh scale={[0.82, 0.95, 0.85]} position={[0, 0, 0]}>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial color={item.color || '#b45309'} roughness={0.6} />
          </mesh>
          {/* Metallic handle knob */}
          <mesh position={[width * 0.32, -0.1, depth * 0.95]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      );
    }
  };

  return (
    <group
      position={item.position}
      rotation={[0, item.rotation || 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(item);
      }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {renderContent()}
      
      <Text
        position={[0, height / 2 + 0.2, 0]}
        fontSize={0.22}
        color="#475569"
        fontWeight="bold"
        anchorX="center"
        anchorY="bottom"
      >
        {item.name || item.type.toUpperCase()}
      </Text>

      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[width * 1.03, height * 1.03, depth * 1.03]} />
          <meshStandardMaterial color="#3b82f6" wireframe opacity={0.7} transparent />
        </mesh>
      )}
    </group>
  );
}

function CameraController({ 
  selectedRack, 
  selectedLevelIndex,
  selectedSketchItem
}: { 
  selectedRack: RackData | null;
  selectedLevelIndex: number | null;
  selectedSketchItem: SketchItem | null;
}) {
  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as any;
  const lastSelectedId = useRef<string | null>(null);
  const lastLevelIndex = useRef<number | null>(null);
  const lastSketchItemId = useRef<string | null>(null);
  const transitionTime = useRef<number>(0);

  useEffect(() => {
    let triggered = false;
    
    if (selectedRack) {
      if (lastSelectedId.current !== selectedRack.id || lastLevelIndex.current !== selectedLevelIndex) {
        lastSelectedId.current = selectedRack.id;
        lastLevelIndex.current = selectedLevelIndex;
        triggered = true;
      }
    } else {
      if (lastSelectedId.current !== null) {
        lastSelectedId.current = null;
        lastLevelIndex.current = null;
        triggered = true;
      }
    }

    if (selectedSketchItem) {
      if (lastSketchItemId.current !== selectedSketchItem.id) {
        lastSketchItemId.current = selectedSketchItem.id;
        triggered = true;
      }
    } else {
      if (lastSketchItemId.current !== null) {
        lastSketchItemId.current = null;
        triggered = true;
      }
    }

    if (triggered) {
      transitionTime.current = 1.0; 
    }
  }, [selectedRack, selectedLevelIndex, selectedSketchItem]);

  useFrame((state, delta) => {
    if (transitionTime.current > 0) {
      transitionTime.current -= delta;
      
      if (selectedRack) {
        const targetX = selectedRack.position[0];
        const levelY = selectedLevelIndex !== null ? selectedLevelIndex * 0.75 + 0.4 : 1.2;
        const targetY = selectedRack.position[1] + levelY;
        const targetZ = selectedRack.position[2];

        const distance = selectedLevelIndex !== null ? 3.5 : 5.5;
        const idealCameraPos = new THREE.Vector3(
          targetX + distance,
          targetY + distance * 0.5,
          targetZ + distance
        );

        camera.position.lerp(idealCameraPos, 0.08);
        if (controls) {
          controls.target.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.08);
          controls.update();
        }
      } else if (selectedSketchItem) {
        const targetX = selectedSketchItem.position[0];
        const targetY = selectedSketchItem.position[1];
        const targetZ = selectedSketchItem.position[2];

        const distance = 4.0;
        const idealCameraPos = new THREE.Vector3(
          targetX + distance,
          targetY + distance * 0.6,
          targetZ + distance
        );

        camera.position.lerp(idealCameraPos, 0.08);
        if (controls) {
          controls.target.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.08);
          controls.update();
        }
      } else {
        const defaultCamPos = new THREE.Vector3(12, 12, 12);
        const defaultTarget = new THREE.Vector3(0, 0, 0);

        camera.position.lerp(defaultCamPos, 0.06);
        if (controls) {
          controls.target.lerp(defaultTarget, 0.06);
          controls.update();
        }
      }
    }
  });

  return null;
}

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
  onSetBoxPopup,
  isOverlapping = false,
  onDoubleClickRack
}: { 
  rack: RackData, 
  inventory: InventoryItem[],
  reservations: Reservation[],
  onMove: (id: string, pos: [number, number, number]) => void,
  onSelect: (rack: RackData | null) => void,
  selectedLevelIndex: number | null,
  onSelectLevel: (levelIndex: number | null, rackObj?: RackData, openModal?: boolean) => void,
  selectedRackId: string | undefined,
  highlightedLevel: { rackId: string; levelIndex: number } | null,
  activeBoxPopup: any | null,
  onSetBoxPopup: (info: any | null) => void,
  isOverlapping?: boolean,
  onDoubleClickRack?: (rack: RackData) => void
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
        {/* Rack Frame Wirebox highlighted with Zone color (or Red if overlapping) */}
        <mesh position={[0, H / 2, 0]} raycast={() => null}>
          <boxGeometry args={[W, H, L]} />
          <meshStandardMaterial 
            color={isOverlapping ? "#ef4444" : activeZone.color} 
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
            <meshStandardMaterial color={isOverlapping ? "#ef4444" : activeZone.color} roughness={0.3} metalness={0.85} />
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
                emissive={isHighlightedShelf ? "#052e16" : "#000005"}
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

  return (
    <>
      <group 
        position={rack.position}
        userData={{ rack }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} 
        onPointerOut={() => setHover(false)}
        onClick={(e) => { 
          e.stopPropagation(); 
          onSelect(rack); 
          onSelectLevel(null);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelect(rack);
          onSelectLevel(null);
          if (onDoubleClickRack) {
            onDoubleClickRack(rack);
          }
        }}
      >
        {renderRackContent()}
      </group>
    </>
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
  onSetBoxPopup,
  isRackOverlapping,
  onDeselectAll,
  sketchItems,
  selectedSketchItem,
  onSelectSketchItem,
  onUpdateSketchItem,
  freeMoveActive,
  onDoubleClickRack,
  onDoubleClickSketchItem
}: { 
  racks: RackData[], 
  inventory: InventoryItem[],
  reservations: Reservation[],
  onMoveRack: (id: string, pos: [number, number, number]) => void,
  onSelectRack: (rack: RackData | null) => void,
  selectedLevelIndex: number | null,
  onSelectLevel: (levelIndex: number | null, rackObj?: RackData, openModal?: boolean) => void,
  selectedRackId: string | undefined,
  highlightedLevel: { rackId: string; levelIndex: number } | null,
  activeBoxPopup: any | null,
  onSetBoxPopup: (info: any | null) => void,
  isRackOverlapping: (rack: RackData) => boolean,
  onDeselectAll: () => void,
  sketchItems: SketchItem[],
  selectedSketchItem: SketchItem | null,
  onSelectSketchItem: (item: SketchItem | null) => void,
  onUpdateSketchItem: (id: string, fields: Partial<SketchItem>) => void,
  freeMoveActive: boolean,
  onDoubleClickRack?: (rack: RackData) => void,
  onDoubleClickSketchItem?: (item: SketchItem) => void
}) => {
  const rackInventories = useMemo(() => {
    const map: { [rackId: string]: InventoryItem[] } = {};
    for (const item of inventory) {
      if (item.rackId) {
        if (!map[item.rackId]) map[item.rackId] = [];
        map[item.rackId].push(item);
      }
    }
    return map;
  }, [inventory]);

  const rackReservations = useMemo(() => {
    const map: { [rackId: string]: Reservation[] } = {};
    for (const res of reservations) {
      if (res.rackId) {
        if (!map[res.rackId]) map[res.rackId] = [];
        map[res.rackId].push(res);
      }
    }
    return map;
  }, [reservations]);

  const { gl, camera, scene } = useThree();
  const selectedRack = useMemo(() => racks.find(r => r.id === selectedRackId), [racks, selectedRackId]);

  useEffect(() => {
    const domElement = gl.domElement;
    let dragStartPos = { x: 0, y: 0 };
    let dragStartTime = 0;

    const findRackInObject = (obj: THREE.Object3D | null): RackData | null => {
      let curr = obj;
      while (curr) {
        if (curr.userData && curr.userData.rack) {
          return curr.userData.rack;
        }
        curr = curr.parent;
      }
      return null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // Only left click
      dragStartPos = { x: e.clientX, y: e.clientY };
      dragStartTime = Date.now();
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return; // Only left click
      
      const dx = e.clientX - dragStartPos.x;
      const dy = e.clientY - dragStartPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const timeElapsed = Date.now() - dragStartTime;

      // If they dragged further than 5 pixels or held for too long (> 400ms), it's drag, ignore
      if (dist > 5 || timeElapsed > 400) {
        return;
      }

      // Convert mouse click coordinates to normalized device coordinates (-1 to +1)
      const rect = domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const tempRaycaster = new THREE.Raycaster();
      tempRaycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      // Raycast against all children of the scene
      const intersects = tempRaycaster.intersectObjects(scene.children, true);

      let clickedRack: RackData | null = null;
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        const rackObj = findRackInObject(hit.object);
        if (rackObj) {
          clickedRack = rackObj;
          break; // Stop at closest intersected rack
        }
      }

      // If we clicked a rack, and it's different from the currently selected rack, select it!
      // This bypasses any interception by PivotControls' invisible dragging planes or handles.
      if (clickedRack && clickedRack.id !== selectedRackId) {
        onSelectRack(clickedRack);
        onSelectLevel(null);
      }
    };

    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('pointerup', handlePointerUp);
    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerUp);
    };
  }, [gl, camera, scene, selectedRackId, onSelectRack, onSelectLevel]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[12, 12, 12]} />
      <OrbitControls 
        makeDefault 
        minPolarAngle={Math.PI / 6} 
        maxPolarAngle={Math.PI / 2.1} 
        enablePan={true}
        panSpeed={1.2}
        maxDistance={100}
      />
      
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

      {/* Large overall warehouse floor bounds to capture empty space clicks anywhere */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0.001, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onDeselectAll();
        }}
      >
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#000000" />
      </mesh>

      {/* Visual representation of 5 vertical zones of the spatial layout */}
      {PHYSICAL_ZONES.map((zone) => {
        return (
          <group key={zone.name}>
            <mesh 
              rotation={[-Math.PI / 2, 0, 0]} 
              position={[0, 0.002, zone.zCenter]}
              onClick={(e) => {
                e.stopPropagation();
                onDeselectAll();
              }}
            >
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
              {zone.lane}
            </Text>
            <Text
              position={[9, 0.015, zone.zCenter]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.65}
              color={zone.color}
              fontWeight="black"
              fillOpacity={0.35}
            >
              {zone.lane}
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
          key={`rack-${rack.id}`} 
          rack={rack} 
          inventory={rackInventories[rack.id] || []}
          reservations={rackReservations[rack.id] || []}
          onMove={onMoveRack} 
          onSelect={onSelectRack}
          selectedLevelIndex={selectedLevelIndex}
          onSelectLevel={onSelectLevel}
          selectedRackId={selectedRackId}
          highlightedLevel={highlightedLevel}
          activeBoxPopup={activeBoxPopup}
          onSetBoxPopup={onSetBoxPopup}
          isOverlapping={isRackOverlapping(rack)}
          onDoubleClickRack={onDoubleClickRack}
        />
      ))}

      {sketchItems.map((item) => (
        <SketchItemMesh
          key={`sketch-item-${item.id}`}
          item={item}
          selectedSketchItemId={selectedSketchItem?.id}
          onSelect={(it) => {
            onSelectSketchItem(it);
            onSelectRack(null);
            onSelectLevel(null);
          }}
          onDoubleClick={(it) => {
            onSelectSketchItem(it);
            onSelectRack(null);
            onSelectLevel(null);
            if (onDoubleClickSketchItem) {
              onDoubleClickSketchItem(it);
            }
          }}
        />
      ))}

      {selectedSketchItem && (
        <PivotControls 
          scale={1.3} 
          activeAxes={freeMoveActive ? [true, true, true] : [true, false, true]} 
          disableRotations={!freeMoveActive}
          disableScaling={!freeMoveActive}
          onDrag={(matrix) => {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrix.decompose(position, rotation, scale);

            const euler = new THREE.Euler().setFromQuaternion(rotation);

            if (freeMoveActive) {
              onUpdateSketchItem(selectedSketchItem.id, {
                position: [position.x, position.y, position.z],
                rotation: euler.y
              });
            } else {
              onUpdateSketchItem(selectedSketchItem.id, {
                position: [position.x, selectedSketchItem.position[1], position.z]
              });
            }
          }}
          visible={true}
          depthTest={false}
          matrix={new THREE.Matrix4().makeTranslation(selectedSketchItem.position[0], selectedSketchItem.position[1], selectedSketchItem.position[2])}
          autoTransform={false}
        />
      )}

      {selectedRack && (
        <PivotControls 
          scale={1.5} 
          activeAxes={freeMoveActive ? [true, true, true] : [true, false, true]} // Only move along horizontal floor layout unless freeMoveActive
          disableRotations={!freeMoveActive}
          disableScaling={!freeMoveActive}
          onDrag={(matrix) => {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrix.decompose(position, rotation, scale);

            if (freeMoveActive) {
              onMoveRack(selectedRack.id, [position.x, position.y, position.z]);
            } else {
              onMoveRack(selectedRack.id, [position.x, 0, position.z]);
            }
          }}
          visible={true}
          depthTest={false}
          matrix={new THREE.Matrix4().makeTranslation(selectedRack.position[0], selectedRack.position[1], selectedRack.position[2])}
          autoTransform={false}
        />
      )}

      {/* Floor plan standard layout mesh with deselection trigger */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.01, 0]} 
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onDeselectAll();
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
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [user, setUser] = useState(auth.currentUser);

  // Memoized lookups for extremely fast per-rack lookups
  const rackInventories = useMemo(() => {
    const map: { [rackId: string]: InventoryItem[] } = {};
    for (const item of inventory) {
      if (item.rackId) {
        if (!map[item.rackId]) map[item.rackId] = [];
        map[item.rackId].push(item);
      }
    }
    return map;
  }, [inventory]);

  const rackReservations = useMemo(() => {
    const map: { [rackId: string]: Reservation[] } = {};
    for (const res of reservations) {
      if (res.rackId) {
        if (!map[res.rackId]) map[res.rackId] = [];
        map[res.rackId].push(res);
      }
    }
    return map;
  }, [reservations]);

  const [levelPopout, setLevelPopout] = useState<LevelPopoutState>({
    open: false,
    rack: null,
    levelIndex: null
  });

  // State inside levelPopout for adding item to level
  const [isAddingToLevel, setIsAddingToLevel] = useState(false);
  const [addingLevelSearch, setAddingLevelSearch] = useState('');
  const [addModeTab, setAddModeTab] = useState<'standard' | 'reservation'>('standard');
  
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

  // Undo Toast state
  const [undoAction, setUndoAction] = useState<{
    type: 'delete_rack' | 'unassign_item' | 'unassign_res';
    data: any;
    message: string;
  } | null>(null);
  const [undoTimer, setUndoTimer] = useState<any | null>(null);

  // Debounced execution variables references
  const debounceTimers = useRef<{ [key: string]: any }>({});

  // Fullscreen support references and state
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Esc key to exit viewport-wide fullscreen has been disabled to prevent double-escape conflicts with rack deselection

  // Lock body scroll of the webpage when viewport fullscreen is enabled
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Trigger window resize event when toggling fullscreen to force the 3D Canvas / ResizeObserver to adapt immediately
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
    const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    const t3 = setTimeout(() => window.dispatchEvent(new Event('resize')), 305);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const [sketchItems, setSketchItems] = useState<SketchItem[]>([]);
  const [selectedSketchItem, setSelectedSketchItem] = useState<SketchItem | null>(null);
  const [freeMoveActive, setFreeMoveActive] = useState<boolean>(false);

  const clearAllSelections = useCallback(() => {
    setSelectedRack(null);
    setSelectedLevelIndex(null);
    setHighlightedLevel(null);
    setLevelPopout({ open: false, rack: null, levelIndex: null });
    setIsAddingToLevel(false);
    setSelectedItemToAlloc(null);
    setActiveBoxPopup(null);
    setSelectedSketchItem(null);
    setFreeMoveActive(false);
  }, []);

  const debounceWrite = (key: string, callback: () => void, delay = 500) => {
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    debounceTimers.current[key] = setTimeout(callback, delay);
  };

  const triggerUndoableAction = (
    type: 'delete_rack' | 'unassign_item' | 'unassign_res',
    data: any,
    message: string
  ) => {
    if (undoTimer) clearTimeout(undoTimer);
    setUndoAction({ type, data, message });
    const timer = setTimeout(() => {
      setUndoAction(null);
    }, 8500);
    setUndoTimer(timer);
  };

  const handleUndo = async () => {
    if (checkViewerAndAlert('Undo Structural Modification')) {
      return;
    }
    if (!undoAction) return;
    const { type, data } = undoAction;
    try {
      if (type === 'delete_rack') {
        const { id, ...properties } = data.rack;
        await setDoc(doc(db, 'racks', id), properties);
        for (const item of data.items) {
          await updateDoc(doc(db, 'inventory', item.id), {
            rackId: id,
            rackLevel: item.rackLevel
          });
        }
        if (data.reservations) {
          for (const res of data.reservations) {
            await updateDoc(doc(db, 'reservations', res.id), {
              rackId: id,
              rackLevel: res.rackLevel
            });
            try {
              await update(ref(rtdb, `reservations/${res.id}`), {
                rackId: id,
                rackLevel: res.rackLevel
              });
            } catch (err_rtdb) {}
          }
        }
      } else if (type === 'unassign_item') {
        const { id, rackId, rackLevel } = data;
        await updateDoc(doc(db, 'inventory', id), {
          rackId,
          rackLevel
        });
      } else if (type === 'unassign_res') {
        const { id, rackId, rackLevel } = data;
        await updateDoc(doc(db, 'reservations', id), {
          rackId,
          rackLevel
        });
        try {
          await update(ref(rtdb, `reservations/${id}`), {
            rackId,
            rackLevel
          });
        } catch (err_rtdb) {}
      }
    } catch (error) {
      console.error("Failed to undo core database state:", error);
    } finally {
      setUndoAction(null);
    }
  };

  // Check overlap with other racks function
  const isRackOverlapping = (rackToCheck: RackData): boolean => {
    return racks.some(r => {
      if (r.id === rackToCheck.id) return false;
      return checkRackOverlap(
        rackToCheck.position,
        rackToCheck.width ?? 2.0,
        rackToCheck.length ?? 0.8,
        r.position,
        r.width ?? 2.0,
        r.length ?? 0.8
      );
    });
  };

  // Allocation confirmation with quantity prompt custom UI step
  const handleConfirmAllocationQty = async () => {
    if (checkViewerAndAlert('Allocate Stock to Rack Level')) {
      return;
    }
    if (!levelPopout.rack || levelPopout.levelIndex === null || !selectedItemToAlloc) return;
    const qtyNum = parseInt(allocQtyInput) || 0;
    
    try {
      if (addModeTab === 'standard') {
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
      } else {
        // Reserved Order Assignment
        await updateDoc(doc(db, 'reservations', selectedItemToAlloc.id), {
          rackId: levelPopout.rack.id,
          rackLevel: levelPopout.levelIndex,
          qty: qtyNum
        });
        try {
          await update(ref(rtdb, `reservations/${selectedItemToAlloc.id}`), {
            rackId: levelPopout.rack.id,
            rackLevel: levelPopout.levelIndex,
            qty: qtyNum
          });
        } catch (err_rtdb) {}
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

  const locateSelectedItem = (entity: any) => {
    const isRes = entity.type === 'reservation' || !!entity.orderId;
    const displayName = isRes ? `${entity.itemName} [${entity.orderId}]` : entity.name;

    if (!entity.rackId || entity.rackLevel === undefined || Number(entity.rackLevel) === -1) {
      setLocatorResult({
        success: false,
        message: `"${displayName}" is not currently allocated to any shelf placement.`,
        item: entity
      });
      setHighlightedLevel(null);
      return;
    }

    const foundRack = racks.find(r => r.id === entity.rackId);
    if (!foundRack) {
      setLocatorResult({
        success: false,
        message: `"${displayName}" is assigned to an unlisted shelf structure.`,
        item: entity
      });
      setHighlightedLevel(null);
      return;
    }

    // Set structure active
    setSelectedRack(foundRack);
    setSelectedLevelIndex(Number(entity.rackLevel));
    
    // Set highlighted state so 3D and 2D components can draw extreme visual attention
    setHighlightedLevel({
      rackId: foundRack.id,
      levelIndex: Number(entity.rackLevel)
    });

    setLocatorResult({
      success: true,
      message: `Located ${entity.type === 'reservation' ? 'Reservation hold' : 'Standard stock'} in ${foundRack.name} at Level ${Number(entity.rackLevel) + 1}.`,
      item: entity
    });
  };

  const executeSearchLocator = () => {
    if (!overallSearchVal.trim()) return;
    const queryStr = overallSearchVal.toLowerCase().trim();

    // 1. Search in standard inventory matching name precisely
    const itemMatch = inventory.find(item => item.name.toLowerCase() === queryStr);
    if (itemMatch) {
      locateSelectedItem({ ...itemMatch, type: 'standard' });
      return;
    }

    // 2. Search in reservations matching orderId or clientName or itemName precisely
    const resMatch = reservations.find(res => 
      res.orderId.toLowerCase() === queryStr || 
      res.clientName.toLowerCase() === queryStr ||
      res.itemName.toLowerCase() === queryStr
    );
    if (resMatch) {
      locateSelectedItem({ ...resMatch, type: 'reservation' });
      return;
    }

    // 3. Fallback substring matching for standard
    const itemSub = inventory.find(item => item.name.toLowerCase().includes(queryStr));
    if (itemSub) {
      locateSelectedItem({ ...itemSub, type: 'standard' });
      return;
    }

    // 4. Fallback substring matching for reservations
    const resSub = reservations.find(res => 
      res.orderId.toLowerCase().includes(queryStr) || 
      res.clientName.toLowerCase().includes(queryStr) ||
      res.itemName.toLowerCase().includes(queryStr)
    );
    if (resSub) {
      locateSelectedItem({ ...resSub, type: 'reservation' });
      return;
    }

    // No matches
    setLocatorResult({
      success: false,
      message: `Could not discover any matching standard stock or reservation for "${overallSearchVal}".`,
      item: null
    });
    setHighlightedLevel(null);
  };

  // States for live assignment form inputs
  const [editName, setEditName] = useState<string>('');
  const [editZone, setEditZone] = useState<string>('');

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
      const dbItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as unknown as InventoryItem);
      setInventory(dbItems);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });
    return () => unsubscribe();
  }, [user]);

  // Synchronize Sketch Items layout configurations
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'sketchItems'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbSketchItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SketchItem));
      if (dbSketchItems.length === 0) {
        // Build initial seed if completely empty
        const initial = [
          { type: 'wall', position: [-8, 1.25, -6], size: [16, 2.5, 0.25], rotation: 0, color: '#e2e8f0', name: 'Back Perimeter Wall' },
          { type: 'window', position: [5, 1.25, -6], size: [4, 1.4, 0.2], rotation: 0, color: '#38bdf8', name: 'West Dock Window' },
          { type: 'door', position: [-4, 1.08, 6], size: [1.3, 2.15, 0.2], rotation: 0, color: '#b45309', name: 'Entrance Door' },
        ];
        initial.forEach(async (item) => {
          try {
            await addDoc(collection(db, 'sketchItems'), item);
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'sketchItems');
          }
        });
      } else {
        setSketchItems(dbSketchItems);
        if (selectedSketchItem) {
          const fresh = dbSketchItems.find(item => item.id === selectedSketchItem.id);
          if (fresh) setSelectedSketchItem(fresh);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sketchItems');
    });
    return () => unsubscribe();
  }, [user, selectedSketchItem?.id]);

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
      const dbRes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as unknown as Reservation);
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

  const onMoveRack = (id: string, newPos: [number, number, number]) => {
    const computedZone = getZoneByZ(newPos[2]).name;
    setRacks(prev => prev.map(r => r.id === id ? { ...r, position: newPos, zone: computedZone } : r));
    setSelectedRack(prev => prev && prev.id === id ? { ...prev, position: newPos, zone: computedZone } : prev);
    
    debounceWrite(`rack-pos-${id}`, async () => {
      try {
        await updateDoc(doc(db, 'racks', id), { 
          position: newPos,
          zone: computedZone
        });
      } catch (error) {
        console.error("Error updating physical position:", error);
      }
    }, 400);
  };

  const addRack = async () => {
    if (checkViewerAndAlert('Create Physical Rack Structure')) {
      return;
    }
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

  const addSketchItem = async (type: 'wall' | 'window' | 'door' | 'toilet_bowl') => {
    if (checkViewerAndAlert('Create Warehouse Fixture Element')) {
      return;
    }
    if (!user) return;
    let baseSize: [number, number, number] = [3.5, 2.5, 0.25]; 
    let baseColor = '#94a3b8';
    let label = 'Wall';
    
    if (type === 'window') {
      baseSize = [1.8, 1.4, 0.2];
      baseColor = '#38bdf8';
      label = 'Window';
    } else if (type === 'door') {
      baseSize = [1.1, 2.15, 0.2];
      baseColor = '#b45309';
      label = 'Door';
    } else if (type === 'toilet_bowl') {
      baseSize = [0.65, 0.8, 0.65];
      baseColor = '#f8fafc';
      label = 'Toilet Bowl';
    }

    const newItem = {
      type,
      position: [0, baseSize[1]/2, 0] as [number, number, number],
      size: baseSize,
      rotation: 0,
      color: baseColor,
      name: `${label} #${Math.floor(100 + Math.random() * 900)}`,
    };

    try {
      await addDoc(collection(db, 'sketchItems'), newItem);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'sketchItems');
    }
  };

  const updateSketchItemProperty = async (id: string, fields: Partial<SketchItem>) => {
    if (checkViewerAndAlert('Update Fixture Properties')) {
      return;
    }
    setSketchItems(prev => prev.map(item => item.id === id ? { ...item, ...fields } : item));
    if (selectedSketchItem && selectedSketchItem.id === id) {
      setSelectedSketchItem(prev => prev ? { ...prev, ...fields } : null);
    }
    
    debounceWrite(`sketch-${id}`, async () => {
      try {
        await updateDoc(doc(db, 'sketchItems', id), fields);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `sketchItems/${id}`);
      }
    });
  };

  const deleteSketchItem = async (id: string) => {
    if (checkViewerAndAlert('Delete Warehouse Fixture')) {
      return;
    }
    if (selectedSketchItem?.id === id) {
      setSelectedSketchItem(null);
    }
    setSketchItems(prev => prev.filter(item => item.id !== id));
    try {
      await deleteDoc(doc(db, 'sketchItems', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `sketchItems/${id}`);
    }
  };

  const deleteRack = async (id: string) => {
    if (checkViewerAndAlert('Decommission Rack Structure')) {
      return;
    }
    if (!selectedRack) return;
    try {
      const placedItems = inventory.filter(item => item.rackId === id);
      const placedRes = reservations.filter(res => res.rackId === id);

      const batch = writeBatch(db);
      
      // Clear level location references of items stored here
      for (const item of placedItems) {
        const itemRef = doc(db, 'inventory', item.id);
        batch.update(itemRef, {
          rackId: '',
          rackLevel: -1
        });
      }

      // Clear reservations references stored here
      for (const res of placedRes) {
        const resRef = doc(db, 'reservations', res.id);
        batch.update(resRef, {
          rackId: '',
          rackLevel: -1
        });
      }

      const rackRef = doc(db, 'racks', id);
      batch.delete(rackRef);

      await batch.commit();

      triggerUndoableAction('delete_rack', { 
        rack: selectedRack, 
        items: placedItems, 
        reservations: placedRes 
      }, `Deleted physical structure: ${selectedRack.name}`);

      setSelectedRack(null);
      setSelectedLevelIndex(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'racks');
    }
  };

  const updateRackProperty = async (fields: Partial<RackData>) => {
    if (checkViewerAndAlert('Update Rack Settings')) {
      return;
    }
    if (!selectedRack) return;
    try {
      await updateDoc(doc(db, 'racks', selectedRack.id), fields);
      setSelectedRack(prev => prev ? { ...prev, ...fields } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'racks');
    }
  };

  const pendingUpdatesRef = useRef<{ [key: string]: any }>({});
  const timeoutRef = useRef<any>(null);

  const debouncedUpdateRackProperty = useCallback((fields: Partial<RackData>) => {
    if (checkViewerAndAlert('Adjust Rack Placement')) {
      return;
    }
    if (!selectedRack) return;
    
    // Snappy, immediate local UI updates for responsiveness
    setSelectedRack(prev => prev ? { ...prev, ...fields } : null);
    setRacks(prev => prev.map(r => r.id === selectedRack.id ? { ...r, ...fields } : r));

    // Queue updates for batch write
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...fields };

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      const fieldsToFlush = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      try {
        await updateDoc(doc(db, 'racks', selectedRack.id), fieldsToFlush);
      } catch (error) {
        console.error("Error flushing debounced rack property updates:", error);
      }
    }, 400); // 400ms delay
  }, [selectedRack?.id]);

  const updateRackPosition = (axis: 'x' | 'y' | 'z', delta: number) => {
    if (checkViewerAndAlert('Shift Rack Coordinates')) {
      return;
    }
    if (!selectedRack) return;
    const currentPos = [...selectedRack.position] as [number, number, number];
    if (axis === 'x') currentPos[0] = Number((currentPos[0] + delta).toFixed(2));
    if (axis === 'y') currentPos[1] = Number((currentPos[1] + delta).toFixed(2));
    if (axis === 'z') currentPos[2] = Number((currentPos[2] + delta).toFixed(2));
    
    let nextZone = selectedRack.zone;
    if (axis === 'z') {
      nextZone = getZoneByZ(currentPos[2]).name;
    }
    
    // Smooth, snappy local updates
    setSelectedRack(prev => prev ? { ...prev, position: currentPos, zone: nextZone } : null);
    setRacks(prev => prev.map(r => r.id === selectedRack.id ? { ...r, position: currentPos, zone: nextZone } : r));

    debounceWrite(`rack-pos-${selectedRack.id}`, async () => {
      try {
        await updateDoc(doc(db, 'racks', selectedRack.id), {
          position: currentPos,
          zone: nextZone
        });
      } catch (error) {
        console.error("Error updating physical position:", error);
      }
    }, 400);
  };

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLevelPopout({ open: false, rack: null, levelIndex: null });
        setSelectedRack(null);
        setSelectedLevelIndex(null);
        setIsAddingToLevel(false);
        setSelectedItemToAlloc(null);
        setActiveBoxPopup(null);
        return;
      }

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

  const handleAssignItem = async (itemId: string, levelIdx: number) => {
    if (checkViewerAndAlert('Rack Stock Assignment')) {
      return;
    }
    if (!selectedRack || !itemId) return;
    try {
      await updateDoc(doc(db, 'inventory', itemId), {
        rackId: selectedRack.id,
        rackLevel: levelIdx
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleUnassignItem = async (itemId: string) => {
    if (checkViewerAndAlert('Unassign Shelf Stock')) {
      return;
    }
    const item = inventory.find(i => i.id === itemId);
    if (!item) return;
    const originalRackId = item.rackId;
    const originalRackLevel = item.rackLevel;
    try {
      await updateDoc(doc(db, 'inventory', itemId), {
        rackId: '',
        rackLevel: -1
      });
      triggerUndoableAction('unassign_item', {
        id: itemId,
        rackId: originalRackId,
        rackLevel: originalRackLevel
      }, `Item "${item.name}" shifted off rack position.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleUnassignReservation = async (reservationId: string) => {
    if (checkViewerAndAlert('Unassign Hold Reservation from Shelf')) {
      return;
    }
    const res = reservations.find(r => r.id === reservationId);
    if (!res) return;
    const originalRackId = res.rackId;
    const originalRackLevel = res.rackLevel;
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
      triggerUndoableAction('unassign_res', {
        id: reservationId,
        rackId: originalRackId,
        rackLevel: originalRackLevel
      }, `Client reservation Hold "${res.orderId}" removed from shelf.`);
    } catch (error) {
      console.error("Error unassigning reservation shelf placement: ", error);
    }
  };

  const handleAssignReservationToLevel = async (resId: string, levelIndex: number) => {
    if (checkViewerAndAlert('Shelf Reservation Assignment')) {
      return;
    }
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

  return (
    <div 
      className={cn(
        "flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500 overflow-hidden pb-4",
        isFullscreen 
          ? "fixed inset-0 z-50 bg-slate-950 p-6 w-screen h-screen" 
          : "h-[calc(100vh-140px)] w-full"
      )}
    >
      <div 
        className={cn(
          "flex-1 flex flex-col gap-4 pr-1 min-h-0 h-full max-h-full",
          isFullscreen ? "overflow-hidden" : "overflow-y-auto"
        )}
      >
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className={cn("text-xl font-bold tracking-tight", isFullscreen ? "text-slate-100" : "text-slate-800")}>Location Matrix</h1>
            <p className={cn("text-[11px] uppercase tracking-wider font-semibold", isFullscreen ? "text-slate-400" : "text-slate-500")}>Warehouse Floor Map & Configuration</p>
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
        <div className={cn(
          "p-3.5 rounded-xl border flex flex-col sm:flex-row gap-3 items-center justify-between shadow-xs shrink-0",
          isFullscreen ? "bg-slate-900 border-slate-800" : "bg-[#FAF8F5] border-[#EDE7DF]"
        )}>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className={cn("p-2 rounded-lg", isFullscreen ? "bg-slate-800 text-slate-300" : "bg-[#EBE3D5] text-amber-900")}>
              <Search className="w-4 h-4" />
            </div>
            <div>
              <p className={cn("text-xs font-black uppercase tracking-wider", isFullscreen ? "text-slate-200" : "text-slate-800")}>Stock Locator</p>
              <p className={cn("text-[9px] font-bold uppercase tracking-widest mt-0.5", isFullscreen ? "text-slate-400" : "text-[#8C8273]")}>Find physical shelf placement instantly</p>
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
              className={cn(
                "w-full border rounded-lg py-2 pl-3 pr-10 text-xs font-semibold outline-none focus:border-blue-500 shadow-sm",
                isFullscreen ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-[#E2D8C9] text-slate-800"
              )}
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
              <div className={cn(
                "absolute top-11 left-0 right-0 max-h-48 overflow-y-auto rounded-xl shadow-xl z-20 space-y-1 p-2 border",
                isFullscreen ? "bg-slate-900 border-slate-850 text-slate-100" : "bg-white border-[#EDE7DF] text-slate-800"
              )}>
                {(() => {
                  const filteredInv = inventory.filter(item => 
                    item.name.toLowerCase().includes(overallSearchVal.toLowerCase())
                  ).map(item => ({ ...item, type: 'standard' as const, searchLabel: item.name }));

                  const filteredRes = reservations.filter(res => 
                    res.orderId.toLowerCase().includes(overallSearchVal.toLowerCase()) || 
                    res.clientName.toLowerCase().includes(overallSearchVal.toLowerCase()) ||
                    res.itemName.toLowerCase().includes(overallSearchVal.toLowerCase())
                  ).map(res => ({ ...res, type: 'reservation' as const, searchLabel: `${res.orderId} (${res.clientName}) - ${res.itemName}` }));

                  const allMatches = [...filteredInv, ...filteredRes];

                  if (allMatches.length > 0) {
                    return allMatches.map((match, idx) => (
                      <div 
                        key={`locator-match-${match.id}-${idx}`}
                        onClick={() => {
                          setOverallSearchVal(match.type === 'standard' ? match.name : match.orderId);
                          setShowSearchDropdown(false);
                          locateSelectedItem(match);
                        }}
                        className={cn(
                          "p-2 rounded-lg text-xs font-bold cursor-pointer flex justify-between items-center transition-all border",
                          isFullscreen 
                            ? "bg-slate-950 hover:bg-slate-800 border-transparent hover:border-slate-820 text-slate-300"
                            : "bg-slate-50/50 hover:bg-slate-100/75 border-transparent hover:border-slate-150 text-slate-700"
                        )}
                      >
                        <div className="flex flex-col gap-0.5 truncate pr-2">
                          <span className="truncate">{match.searchLabel}</span>
                          <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">{match.type === 'reservation' ? 'Reservation Hold' : 'Standard Inventory'}</span>
                        </div>
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border leading-none shrink-0",
                          match.rackId ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-100 border-slate-200 text-slate-400"
                        )}>
                          {match.rackId ? "Allocated" : "Unplaced"}
                        </span>
                      </div>
                    ));
                  } else {
                    return <div className="p-3 text-center text-[10px] text-slate-400 italic">No matches discovered</div>;
                  }
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Highlight overlay */}
        {locatorResult && (
          <div className={cn(
            "p-3 rounded-xl border text-[10.5px] font-bold uppercase tracking-wider flex items-center justify-between gap-2.5 animate-in fade-in duration-200 shrink-0",
            locatorResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
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
        <div 
          ref={containerRef} 
          className={cn(
            "bg-slate-900 overflow-hidden relative group rounded-[20px] border border-slate-805 shadow-inner flex-1",
            isFullscreen ? "min-h-0" : "min-h-[350px]"
          )}
        >
          {racks.length > 0 ? (
            <Canvas 
              shadows
              onPointerMissed={clearAllSelections}
            >
              <WarehouseScene 
                racks={racks} 
                inventory={inventory}
                reservations={reservations}
                onMoveRack={onMoveRack} 
                onSelectRack={(rk) => {
                  setSelectedRack(rk);
                  setSelectedSketchItem(null);
                  setHighlightedLevel(null);
                  if (rk === null) {
                    clearAllSelections();
                  } else {
                    setFreeMoveActive(false);
                  }
                }} 
                selectedLevelIndex={selectedLevelIndex}
                onSelectLevel={(levelIdx, rk, openModal = true) => {
                  setSelectedLevelIndex(levelIdx);
                  if (levelIdx !== null) {
                    const activeRk = rk || selectedRack;
                    if (activeRk) {
                       setSelectedRack(activeRk);
                    }
                    if (activeRk && openModal) {
                      setLevelPopout({
                        open: true,
                        rack: activeRk,
                        levelIndex: levelIdx
                      });
                    }
                  } else {
                    setLevelPopout({ open: false, rack: null, levelIndex: null });
                  }
                }}
                selectedRackId={selectedRack?.id}
                highlightedLevel={highlightedLevel}
                activeBoxPopup={activeBoxPopup}
                onSetBoxPopup={setActiveBoxPopup}
                isRackOverlapping={isRackOverlapping}
                onDeselectAll={clearAllSelections}
                sketchItems={sketchItems}
                selectedSketchItem={selectedSketchItem}
                onSelectSketchItem={(item) => {
                  setSelectedSketchItem(item);
                  setSelectedRack(null);
                  if (item === null) {
                    setFreeMoveActive(false);
                  } else {
                    setFreeMoveActive(false);
                  }
                }}
                onUpdateSketchItem={updateSketchItemProperty}
                freeMoveActive={freeMoveActive}
                onDoubleClickRack={(rk) => {
                  setSelectedRack(rk);
                  setSelectedSketchItem(null);
                  setHighlightedLevel(null);
                  setFreeMoveActive(true);
                }}
                onDoubleClickSketchItem={(item) => {
                  setSelectedSketchItem(item);
                  setSelectedRack(null);
                  setFreeMoveActive(true);
                }}
              />
              <CameraController 
                selectedRack={selectedRack}
                selectedLevelIndex={selectedLevelIndex}
                selectedSketchItem={selectedSketchItem}
              />
            </Canvas>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-950 text-center select-none text-slate-200">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl text-slate-500 mb-4 animate-pulse">
                <Warehouse className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">No Racks Placed</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5 max-w-xs leading-normal">
                Your workshop warehouse layout is empty. Click "+ Add New Rack" to begin layout design.
              </p>
              <button 
                onClick={addRack}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 duration-150 transition-all shadow-md shadow-blue-900/50 cursor-pointer"
              >
                + Place First Rack
              </button>
            </div>
          )}

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
                className="absolute right-4 top-4 bg-white/95 backdrop-blur border border-slate-200/80 p-4 rounded-2xl shadow-xl w-64 text-slate-805 flex flex-col gap-3 z-10 animate-in slide-in-from-right"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-105 p-2 rounded-xl text-blue-600 shadow-3xs">
                      <Move className="w-4 h-4 animate-pulse shrink-0" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-extrabold text-slate-505 uppercase tracking-widest leading-none">SPATIAL DECK</h4>
                      <p className="text-xs font-black text-slate-800 mt-1 font-mono leading-none">{selectedRack.name}</p>
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

                <div className="flex flex-col gap-2.5">
                  {freeMoveActive && (
                    <div className="bg-sky-50 border border-sky-100 text-sky-850 p-2 rounded-xl text-center shadow-3xs shrink-0">
                      <span className="text-[9px] font-black uppercase tracking-wider block">🚀 Free Moving Mode Active</span>
                      <span className="text-[8px] font-bold block text-sky-600 leading-none mt-0.5">Drag any axis, rotate, or elevate!</span>
                    </div>
                  )}

                  {/* Coordinates Info Board */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center shadow-3xs">
                    <div className="flex flex-col items-center">
                      <span className="text-[7.5px] font-black uppercase text-slate-400 tracking-wider">West ── East</span>
                      <span className="font-mono text-[10px] font-black text-blue-600 mt-1">X: {selectedRack.position[0].toFixed(1)}m</span>
                    </div>
                    <div className="flex flex-col items-center border-l border-slate-150">
                      <span className="text-[7.5px] font-black uppercase text-slate-400 tracking-wider">North ── South</span>
                      <span className="font-mono text-[10px] font-black text-indigo-700 mt-1">Z: {selectedRack.position[2].toFixed(1)}m</span>
                    </div>
                  </div>

                  {/* Range sliders with clear descriptions */}
                  <div className="space-y-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100 shadow-3xs">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[8.5px] font-extrabold text-slate-500 uppercase tracking-wide">
                        <span>← West | East →</span>
                        <span className="font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[8px] font-bold">X-Axis</span>
                      </div>
                      <input 
                        type="range"
                        min="-20.0"
                        max="20.0"
                        step="0.1"
                        value={selectedRack.position[0]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onMoveRack(selectedRack.id, [val, selectedRack.position[1], selectedRack.position[2]]);
                        }}
                        className="w-full h-1 bg-slate-200 accent-blue-600 rounded-lg cursor-pointer"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[8.5px] font-extrabold text-slate-500 uppercase tracking-wide">
                        <span>↑ North | South ↓</span>
                        <span className="font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[8px] font-bold">Z-Axis</span>
                      </div>
                      <input 
                        type="range"
                        min="-20.0"
                        max="20.0"
                        step="0.1"
                        value={selectedRack.position[2]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onMoveRack(selectedRack.id, [selectedRack.position[0], selectedRack.position[1], val]);
                        }}
                        className="w-full h-1 bg-slate-200 accent-indigo-600 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Manual Nudge Pad & Recenter Button */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col items-center gap-2.5">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Interactive D-Pad</span>
                    
                    <div className="grid grid-cols-3 gap-1 w-24 border-none bg-transparent">
                      <div />
                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0], selectedRack.position[1], selectedRack.position[2] - 0.5])}
                        className="w-8 h-8 bg-white hover:bg-blue-600 border border-slate-200 hover:border-blue-550 rounded-lg flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-2xs group active:scale-90"
                        title="Nudge North (W / Up)"
                      >
                        <ArrowUp className="w-3.5 h-3.5 text-slate-500 group-hover:text-white" />
                      </button>
                      <div />

                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0] - 0.5, selectedRack.position[1], selectedRack.position[2]])}
                        className="w-8 h-8 bg-white hover:bg-blue-600 border border-slate-200 hover:border-blue-550 rounded-lg flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-2xs group active:scale-90"
                        title="Nudge West (A / Left)"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-slate-500 group-hover:text-white" />
                      </button>
                      
                      <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex flex-col items-center justify-center select-none text-[6px] font-bold text-blue-600 leading-none">
                        <span>STEP</span>
                        <span className="text-[7.5px] text-blue-700 font-mono mt-0.5 font-black">0.5m</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0] + 0.5, selectedRack.position[1], selectedRack.position[2]])}
                        className="w-8 h-8 bg-white hover:bg-blue-600 border border-slate-200 hover:border-blue-550 rounded-lg flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-2xs group active:scale-90"
                        title="Nudge East (D / Right)"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white" />
                      </button>

                      <div />
                      <button
                        type="button"
                        onClick={() => onMoveRack(selectedRack.id, [selectedRack.position[0], selectedRack.position[1], selectedRack.position[2] + 0.5])}
                        className="w-8 h-8 bg-white hover:bg-blue-600 border border-slate-200 hover:border-blue-550 rounded-lg flex items-center justify-center transition-all hover:text-white cursor-pointer shadow-2xs group active:scale-90"
                        title="Nudge South (S / Down)"
                      >
                        <ArrowDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-white" />
                      </button>
                      <div />
                    </div>

                    <button
                      type="button"
                      onClick={() => onMoveRack(selectedRack.id, [0, selectedRack.position[1], 0])}
                      className="w-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[8.5px] font-black uppercase tracking-widest py-1 px-2 rounded-lg transition-all active:scale-95 cursor-pointer"
                    >
                      Reset position to center (0, 0)
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floated Level Popout Panel on the left side of viewport mapping */}
          <AnimatePresence>
            {levelPopout.open && levelPopout.rack && levelPopout.levelIndex !== null && (
              <motion.div 
                initial={{ opacity: 0, x: -35 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -35 }} 
                className="absolute left-4 top-4 bottom-4 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl z-20 overflow-hidden flex flex-col border border-slate-200"
              >
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50 shrink-0">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
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
                    className="text-slate-400 hover:text-slate-600 flex items-center justify-center w-7 h-7 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto space-y-4 flex-1">
                  {!isAddingToLevel ? (
                    <>
                      {/* Standard inventory */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block pb-1 border-b border-slate-50">Standard Stock Items</span>
                        {inventory.filter(item => item.rackId === levelPopout.rack?.id && Number(item.rackLevel) === levelPopout.levelIndex).length > 0 ? (
                          <div className="space-y-1.5">
                            {inventory.filter(item => item.rackId === levelPopout.rack?.id && Number(item.rackLevel) === levelPopout.levelIndex).map((item, idx) => {
                              const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                              const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
                              const boxColor = colors[hash % colors.length];

                              return (
                                <div key={`floated-item-${item.id}-${idx}`} className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-[11px] font-bold text-slate-700">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: boxColor }} />
                                    <span className="uppercase truncate">{item.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px]">QTY: {item.qty}</span>
                                    <button 
                                      onClick={() => handleUnassignItem(item.id)}
                                      className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-5 border border-dashed border-slate-100 rounded-xl text-center text-[10px] text-slate-400 italic">No inventory located here.</div>
                        )}
                      </div>

                      {/* Holds / reservations */}
                      <div className="space-y-2 pt-2">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block pb-1 border-b border-slate-50">Active Reservation Holds</span>
                        {reservations.filter(res => res.rackId === levelPopout.rack?.id && Number(res.rackLevel) === levelPopout.levelIndex).length > 0 ? (
                          <div className="space-y-1.5">
                            {reservations.filter(res => res.rackId === levelPopout.rack?.id && Number(res.rackLevel) === levelPopout.levelIndex).map((res, idx) => (
                              <div key={`floated-res-${res.id}-${idx}`} className="flex items-center justify-between p-2 rounded-xl border border-amber-100 bg-amber-50/10 text-[11px] font-bold text-slate-700">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                  <div className="truncate">
                                    <span className="block truncate text-slate-800 leading-none">{res.orderId}</span>
                                    <span className="block text-[8.5px] text-slate-400 leading-tight mt-0.5 uppercase">{res.clientName}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono text-[9px]">RES: {res.qty}</span>
                                  <button 
                                    onClick={() => handleUnassignReservation(res.id)}
                                    className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-5 border border-dashed border-slate-100 rounded-xl text-center text-[10px] text-slate-400 italic">No reservations holds here.</div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setIsAddingToLevel(true);
                          setAddingLevelSearch('');
                        }}
                        className="w-full py-2.5 mt-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all shadow shadow-blue-200/50 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                        <span>Allocate New SKU Stock</span>
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      {!selectedItemToAlloc ? (
                        <div className="space-y-3 animate-in fade-in slide-in-from-right duration-200">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest">Select Variant Item</span>
                            <button 
                              onClick={() => setIsAddingToLevel(false)}
                              className="text-[9px] font-black text-slate-400 hover:text-slate-800 uppercase"
                            >
                              Back
                            </button>
                          </div>

                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Type stock name..."
                              value={addingLevelSearch}
                              onChange={(e) => setAddingLevelSearch(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-8 pr-3 text-[11px] font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                            />
                          </div>

                          <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                            {inventory.filter(item => 
                              item.name.toLowerCase().includes(addingLevelSearch.toLowerCase())
                            ).map((item, idx) => {
                              const hash = item.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                              const colors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"];
                              const boxColor = colors[hash % colors.length];

                              return (
                                <div 
                                  key={`alloc-f-${item.id}-${idx}`}
                                  onClick={() => {
                                    setSelectedItemToAlloc(item);
                                    setAllocQtyInput(String(item.qty || 1));
                                  }}
                                  className="p-2 border border-slate-100 hover:border-blue-400 bg-slate-50/20 hover:bg-white rounded-lg cursor-pointer transition-colors flex justify-between items-center text-[10.5px] font-bold"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="w-2 rounded shrink-0 h-2" style={{ backgroundColor: boxColor }} />
                                    <span className="truncate uppercase text-slate-800">{item.name}</span>
                                  </div>
                                  <span className="text-[8.5px] font-mono text-blue-600 shrink-0">CHOOSE</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 animate-in fade-in slide-in-from-right duration-250">
                          <div>
                            <span className="text-[8px] font-extrabold text-slate-400 uppercase">Input Loading Volume</span>
                            <span className="text-[11px] font-black text-slate-800 block leading-tight truncate">{selectedItemToAlloc.name}</span>
                          </div>

                          <div className="space-y-1.5 p-3 bg-slate-50/50 rounded-xl border border-slate-150">
                            <label className="text-[8.5px] font-bold text-slate-500 uppercase block mb-1">Assigned Quantity</label>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const c = parseInt(allocQtyInput) || 1;
                                  if (c > 1) setAllocQtyInput(String(c - 1));
                                }}
                                className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-transform active:scale-90"
                              >
                                <Minus className="w-3 h-3 stroke-[3px]" />
                              </button>
                              <input 
                                type="number"
                                value={allocQtyInput}
                                onChange={(e) => setAllocQtyInput(e.target.value)}
                                className="w-full text-center h-8 bg-white border border-slate-200 text-[11px] font-bold text-slate-800 rounded-xl"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const c = parseInt(allocQtyInput) || 0;
                                  setAllocQtyInput(String(c + 1));
                                }}
                                className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-transform active:scale-90"
                              >
                                <Plus className="w-3 h-3 stroke-[3px]" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button 
                              onClick={() => setSelectedItemToAlloc(null)}
                              className="flex-1 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase transition-all"
                            >
                              Back
                            </button>
                            <button 
                              onClick={handleConfirmAllocationQty}
                              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-black uppercase transition-all shadow-md active:scale-95"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
                  <button 
                    onClick={() => {
                      setLevelPopout({ open: false, rack: null, levelIndex: null });
                      setIsAddingToLevel(false);
                      setSelectedItemToAlloc(null);
                      setAllocQtyInput('1');
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-widest rounded-lg transition-all cursor-pointer"
                  >
                    Close Sheet
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fullscreen Toggle Overlay Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute bottom-4 right-4 z-20 p-2.5 bg-slate-900/90 hover:bg-slate-850 text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow-xl flex items-center justify-center group/fullscreen"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 transition-transform group-hover/fullscreen:scale-110" />
            ) : (
              <Maximize2 className="w-4 h-4 transition-transform group-hover/fullscreen:scale-110" />
            )}
          </button>
        </div>
      </div>

      {/* Right Sidebar - Properties & Level Content Sub-layers */}
      <aside className="w-full lg:w-96 bg-white border border-slate-200 rounded-lg flex flex-col p-5 shadow-sm overflow-y-auto h-full max-h-full">
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
            {isRackOverlapping(selectedRack) && (
              <div id="spatial-collision-warning" className="bg-rose-50 border border-rose-200/60 rounded-xl p-3.5 text-rose-900 flex items-start gap-2.5 animate-in fade-in zoom-in-95 duration-200">
                <span className="text-base leading-none select-none shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-rose-800">Spatial Overlap Warning</h4>
                  <p className="text-[10px] font-semibold text-rose-600 mt-1 uppercase tracking-wide leading-normal">
                    This structure overlaps another layout object. Reposition using Arrow/WASD keys or coordinates select to ensure clearance.
                  </p>
                </div>
              </div>
            )}
            
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
                      debouncedUpdateRackProperty({ name: e.target.value }); 
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
                      const zoneMatch = PHYSICAL_ZONES.find(z => z.name === selectedVal);
                      const targetZ = zoneMatch ? zoneMatch.zCenter : 0;
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
                  onChange={(e) => debouncedUpdateRackProperty({ width: parseFloat(e.target.value) })}
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
                  onChange={(e) => debouncedUpdateRackProperty({ length: parseFloat(e.target.value) })}
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
                    debouncedUpdateRackProperty({ levelsCount: newLevels });
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
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Layout className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                <span>3D Architectural Sketch Elements</span>
              </h3>

              {/* Creator Button Grid */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => addSketchItem('wall')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95Group"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600 font-bold text-xs">W</div>
                  <span className="text-[9.5px] font-bold">Add Wall</span>
                </button>
                <button
                  type="button"
                  onClick={() => addSketchItem('window')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95Group"
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-xs font-mono">🪟</div>
                  <span className="text-[9.5px] font-bold">Add Window</span>
                </button>
                <button
                  type="button"
                  onClick={() => addSketchItem('door')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95Group"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs">🚪</div>
                  <span className="text-[9.5px] font-bold">Add Door</span>
                </button>
                <button
                  type="button"
                  onClick={() => addSketchItem('toilet_bowl')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95Group"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">🚽</div>
                  <span className="text-[9.5px] font-bold">Add Toilet</span>
                </button>
              </div>

              {/* Highlight / Details of the Selected 3D Sketch Element */}
              {selectedSketchItem ? (
                <div className="space-y-3.5 bg-blue-50/20 p-3.5 rounded-2xl border border-blue-105 active:ring-1 active:ring-blue-400">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-wider font-mono">Active Element Editor</span>
                    <button
                       type="button"
                       onClick={() => deleteSketchItem(selectedSketchItem.id)}
                       className="text-[9px] font-extrabold text-rose-500 hover:text-rose-600 uppercase cursor-pointer"
                    >
                      Delete Item
                    </button>
                  </div>

                  {freeMoveActive && (
                    <div className="bg-sky-50 border border-sky-100 text-sky-850 p-2 rounded-xl text-center shadow-3xs shrink-0">
                      <span className="text-[9px] font-black uppercase tracking-wider block">🚀 Free Moving Mode Active</span>
                      <span className="text-[8px] font-bold block text-sky-600 leading-none mt-0.5">Drag any axis, rotate, or elevate!</span>
                    </div>
                  )}

                  {/* Name field */}
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-extrabold text-slate-450 uppercase block">Element Label Name</label>
                    <input 
                      type="text"
                      value={selectedSketchItem.name || ''}
                      onChange={(e) => updateSketchItemProperty(selectedSketchItem.id, { name: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-[11px] font-bold text-slate-800 outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Size Adjusters / Resizers */}
                  <div className="space-y-2 border-t border-blue-50/50 pt-2.5">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block font-bold leading-none">Element Sizing (Thickness / Lengths)</span>
                    
                    {/* Width Slider */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-bold text-slate-500">
                        <span>Width (X-Span)</span>
                        <span className="font-mono font-bold text-slate-700">{selectedSketchItem.size[0].toFixed(1)}m</span>
                      </div>
                      <input 
                        type="range"
                        min="0.5"
                        max="18.0"
                        step="0.1"
                        value={selectedSketchItem.size[0]}
                        onChange={(e) => {
                          const w = parseFloat(e.target.value);
                          updateSketchItemProperty(selectedSketchItem.id, {
                            size: [w, selectedSketchItem.size[1], selectedSketchItem.size[2]]
                          });
                        }}
                        className="w-full accent-blue-600 h-1 bg-slate-202 roundedAppearance cursor-ew-resize"
                      />
                    </div>

                    {/* Height Slider */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-bold text-slate-500">
                        <span>Height (Y-Rise)</span>
                        <span className="font-mono font-bold text-slate-700">{selectedSketchItem.size[1].toFixed(1)}m</span>
                      </div>
                      <input 
                        type="range"
                        min="0.5"
                        max="8.0"
                        step="0.1"
                        value={selectedSketchItem.size[1]}
                        onChange={(e) => {
                          const h = parseFloat(e.target.value);
                          updateSketchItemProperty(selectedSketchItem.id, {
                            size: [selectedSketchItem.size[0], h, selectedSketchItem.size[2]],
                            position: [selectedSketchItem.position[0], h/2, selectedSketchItem.position[2]] // keeps on ground level
                          });
                        }}
                        className="w-full accent-blue-600 h-1 bg-slate-202 roundedAppearance cursor-ew-resize"
                      />
                    </div>

                    {/* Thickness Slider */}
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] font-bold text-slate-500">
                        <span>Thickness (Depth)</span>
                        <span className="font-mono font-bold text-slate-700">{selectedSketchItem.size[2].toFixed(1)}m</span>
                      </div>
                      <input 
                        type="range"
                        min="0.05"
                        max="2.0"
                        step="0.05"
                        value={selectedSketchItem.size[2]}
                        onChange={(e) => {
                          const d = parseFloat(e.target.value);
                          updateSketchItemProperty(selectedSketchItem.id, {
                            size: [selectedSketchItem.size[0], selectedSketchItem.size[1], d]
                          });
                        }}
                        className="w-full accent-blue-600 h-1 bg-slate-202 roundedAppearance cursor-ew-resize"
                      />
                    </div>
                  </div>

                  {/* Orientation Rotations Slider */}
                  <div className="space-y-1.5 border-t border-blue-50/50 pt-2.5">
                    <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                      <span>Rotation Yaw (Angle)</span>
                      <span className="font-mono font-bold text-slate-600">{Math.round((selectedSketchItem.rotation || 0) * (180 / Math.PI))}°</span>
                    </div>
                    <input 
                      type="range"
                      min="-3.1415"
                      max="3.1415"
                      step="0.05"
                      value={selectedSketchItem.rotation || 0}
                      onChange={(e) => {
                        updateSketchItemProperty(selectedSketchItem.id, { rotation: parseFloat(e.target.value) });
                      }}
                      className="w-full accent-indigo-600 h-1 bg-slate-202 roundedAppearance cursor-ew-resize"
                    />
                  </div>

                  {/* Color Preset Palette Selection */}
                  <div className="space-y-1.5 border-t border-blue-50/50 pt-2.5">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block">Material Preset Accent Color</span>
                    <div className="flex gap-2">
                      {['#e2e8f0', '#cbd5e1', '#64748b', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#b45309', '#451a03'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateSketchItemProperty(selectedSketchItem.id, { color: c })}
                          className={cn(
                            "w-4 h-4 rounded-full border border-slate-200 cursor-pointer shadow-3xs transition-transform active:scale-75",
                            selectedSketchItem.color === c ? "scale-125 ring-2 ring-blue-500 ring-offset-1" : ""
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 p-4 rounded-xl text-center">
                  <p className="text-[10px] text-slate-400 italic">No element selected.</p>
                  <p className="text-[9.5px] text-slate-450 mt-1">Double click elements in the 3D floor map to adjust parameters or use the creation buttons above.</p>
                </div>
              )}
            </div>
          </div>
        ) : selectedSketchItem ? (
          // Sketch Element Selected View
          <div className="space-y-6 animate-in slide-up duration-300">
            <div className="space-y-4">
              <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Layout className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                <span>3D Architectural Sketch Elements</span>
              </h3>

              {/* Creator Button Grid */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => addSketchItem('wall')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600 font-bold text-xs">W</div>
                  <span className="text-[9.5px] font-bold">Add Wall</span>
                </button>
                <button
                  type="button"
                  onClick={() => addSketchItem('window')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-xs font-mono">🪟</div>
                  <span className="text-[9.5px] font-bold">Add Window</span>
                </button>
                <button
                  type="button"
                  onClick={() => addSketchItem('door')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs">🚪</div>
                  <span className="text-[9.5px] font-bold">Add Door</span>
                </button>
                <button
                  type="button"
                  onClick={() => addSketchItem('toilet_bowl')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">🚽</div>
                  <span className="text-[9.5px] font-bold">Add Toilet</span>
                </button>
              </div>

              {/* Active element properties editor */}
              <div className="space-y-3.5 bg-blue-50/20 p-3.5 rounded-2xl border border-blue-100 active:ring-1 active:ring-blue-400">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-wider font-mono font-bold">Active Element Editor</span>
                  <button
                    type="button"
                    onClick={() => {
                      deleteSketchItem(selectedSketchItem.id);
                      setSelectedSketchItem(null);
                    }}
                    className="text-[9px] font-extrabold text-rose-500 hover:text-rose-600 cursor-pointer"
                  >
                    Delete Item
                  </button>
                </div>

                {/* Name field */}
                <div className="space-y-1">
                  <label className="text-[8.5px] font-extrabold text-slate-455 uppercase block">Element Label Name</label>
                  <input 
                    type="text"
                    value={selectedSketchItem.name || ''}
                    onChange={(e) => updateSketchItemProperty(selectedSketchItem.id, { name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-[11px] font-bold text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>

                {/* Size Adjusters / Resizers */}
                <div className="space-y-2 border-t border-blue-100 pt-2.5">
                  <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block font-bold leading-none animate-fade-in">Element Sizing</span>
                  
                  {/* Width Slider */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[8px] font-bold text-slate-500">
                      <span>Width (X-Span)</span>
                      <span className="font-mono font-bold text-slate-700">{selectedSketchItem.size[0].toFixed(1)}m</span>
                    </div>
                    <input 
                      type="range"
                      min="0.5"
                      max="18.0"
                      step="0.1"
                      value={selectedSketchItem.size[0]}
                      onChange={(e) => {
                        const w = parseFloat(e.target.value);
                        updateSketchItemProperty(selectedSketchItem.id, {
                          size: [w, selectedSketchItem.size[1], selectedSketchItem.size[2]]
                        });
                      }}
                      className="w-full accent-blue-600 h-1 bg-slate-200 rounded cursor-ew-resize"
                    />
                  </div>

                  {/* Height Slider */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[8px] font-bold text-slate-500">
                      <span>Height (Y-Rise)</span>
                      <span className="font-mono font-bold text-slate-700">{selectedSketchItem.size[1].toFixed(1)}m</span>
                    </div>
                    <input 
                      type="range"
                      min="0.5"
                      max="8.0"
                      step="0.1"
                      value={selectedSketchItem.size[1]}
                      onChange={(e) => {
                        const h = parseFloat(e.target.value);
                        updateSketchItemProperty(selectedSketchItem.id, {
                          size: [selectedSketchItem.size[0], h, selectedSketchItem.size[2]],
                          position: [selectedSketchItem.position[0], h/2, selectedSketchItem.position[2]]
                        });
                      }}
                      className="w-full accent-blue-600 h-1 bg-slate-200 rounded cursor-ew-resize"
                    />
                  </div>

                  {/* Thickness Slider */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[8px] font-bold text-slate-500">
                      <span>Thickness (Depth)</span>
                      <span className="font-mono font-bold text-slate-700">{selectedSketchItem.size[2].toFixed(1)}m</span>
                    </div>
                    <input 
                      type="range"
                      min="0.05"
                      max="2.0"
                      step="0.05"
                      value={selectedSketchItem.size[2]}
                      onChange={(e) => {
                        const d = parseFloat(e.target.value);
                        updateSketchItemProperty(selectedSketchItem.id, {
                          size: [selectedSketchItem.size[0], selectedSketchItem.size[1], d]
                        });
                      }}
                      className="w-full accent-blue-600 h-1 bg-slate-200 rounded cursor-ew-resize"
                    />
                  </div>
                </div>

                {/* Orientation Rotations Slider */}
                <div className="space-y-1.5 border-t border-blue-105 pt-2.5">
                  <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                    <span>Rotation Yaw (Angle)</span>
                    <span className="font-mono font-bold text-slate-600">{Math.round((selectedSketchItem.rotation || 0) * (180 / Math.PI))}°</span>
                  </div>
                  <input 
                    type="range"
                    min="-3.1415"
                    max="3.1415"
                    step="0.05"
                    value={selectedSketchItem.rotation || 0}
                    onChange={(e) => {
                      updateSketchItemProperty(selectedSketchItem.id, { rotation: parseFloat(e.target.value) });
                    }}
                    className="w-full accent-indigo-600 h-1 bg-slate-200"
                  />
                </div>

                {/* Color Preset Palette Selection */}
                <div className="space-y-1.5 border-t border-blue-105 pt-2.5">
                  <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block font-bold leading-none">Material Accent Color</span>
                  <div className="flex flex-wrap gap-1.5">
                    {['#cbd5e1', '#64748b', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#b45309', '#451a03'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSketchItemProperty(selectedSketchItem.id, { color: c })}
                        className={cn(
                          "w-4 h-4 rounded-full border border-slate-200 cursor-pointer shadow-xs transition-transform active:scale-75",
                          selectedSketchItem.color === c ? "scale-110 ring-2 ring-blue-500" : ""
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Default unselected state
          <div className="space-y-6 flex flex-col justify-between h-full max-h-full">
            <div className="space-y-5">
              <div className="bg-slate-50/70 p-4 rounded-2xl text-center border border-slate-100 flex flex-col items-center">
                <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center mb-2.5 text-slate-400">
                  <Package className="w-5 h-5" />
                </div>
                <p className="text-[11px] text-slate-650 font-extrabold uppercase tracking-widest">Floor Console</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-normal font-medium">
                  Select a physical rack in the 2D scene or use keyboard shortcuts. Click and drag or slide values to update. Double-click walls, doors, or windows to resize/rotate.
                </p>
              </div>

              <div className="space-y-4 pt-1">
                <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Layout className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                  <span>3D Architectural Sketch Elements</span>
                </h3>

                {/* Creator Button Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => addSketchItem('wall')}
                    className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-200/50 flex items-center justify-center text-slate-600 font-bold text-xs">W</div>
                    <span className="text-[9.5px] font-bold">Add Wall</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addSketchItem('window')}
                    className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-xs font-mono">🪟</div>
                    <span className="text-[9.5px] font-bold">Add Window</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addSketchItem('door')}
                    className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs">🚪</div>
                    <span className="text-[9.5px] font-bold">Add Door</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addSketchItem('toilet_bowl')}
                    className="bg-slate-50 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-205 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer hover:shadow-2xs active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">🚽</div>
                    <span className="text-[9.5px] font-bold">Add Toilet</span>
                  </button>
                </div>

                <div className="bg-slate-50 border border-dashed border-slate-200 p-4 rounded-xl text-center mt-3">
                  <p className="text-[10px] text-slate-400 italic">No custom element active.</p>
                  <p className="text-[9.5px] text-slate-455 mt-1 leading-relaxed font-semibold uppercase tracking-wide">Click "+ Add Wall", "+ Add Window" or "+ Add Door" to design custom warehouse walls and map divisions!</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Pop-Out Items Selection Modal Popup */}
      {/* legacy standard items assign modal */}
      <AnimatePresence>
        {false && (
          <div />
        )}
      </AnimatePresence>
 








      {/* Level details consolidated in-canvas floating drawer. Old modal disabled. */}
              {false && (<>
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
              </>)}

      {/* Toast Notification for Undo Actions */}
      <AnimatePresence>
        {undoAction && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-4 max-w-sm pointer-events-auto"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping shrink-0" />
              <p className="text-[11px] font-semibold text-slate-200 tracking-wide">{undoAction.message}</p>
            </div>
            <button
              onClick={handleUndo}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/80 px-2.5 py-1 rounded-lg border border-blue-900/30 whitespace-nowrap cursor-pointer"
            >
              Undo Action
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

