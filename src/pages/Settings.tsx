import React, { useState, useEffect } from 'react';
import { 
  Package, MapPin, ClipboardList, Check, RotateCcw, Save, 
  Settings as SettingsIcon, Sliders, AlertTriangle, Eye, ShieldAlert, 
  TrendingDown, Globe, Database, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '@/src/lib/firebase';

export default function Settings({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const isDark = theme === 'dark';
  const [user, setUser] = useState(auth.currentUser);

  // 1. Inventory Settings States
  const [defaultGoal, setDefaultGoal] = useState<number>(5);
  const [criticalThreshold, setCriticalThreshold] = useState<number>(3);
  const [allowNegativeQty, setAllowNegativeQty] = useState<boolean>(false);
  const [autoBarcodeRequired, setAutoBarcodeRequired] = useState<boolean>(false);

  // 2. Location (3D Matrix) Settings States
  const [defaultRackLevels, setDefaultRackLevels] = useState<number>(3);
  const [showZoneHighlights, setShowZoneHighlights] = useState<boolean>(true);
  const [gridSize, setGridSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [perspectivePreset, setPerspectivePreset] = useState<'default' | 'top' | 'isometric'>('default');

  // 3. Status Settings States
  const [autoRestockOnDelete, setAutoRestockOnDelete] = useState<boolean>(true);
  const [defaultStatusLocation, setDefaultStatusLocation] = useState<string>('Client');
  const [restrictToCatalog, setRestrictToCatalog] = useState<boolean>(false);
  const [defaultLoanLimitDays, setDefaultLoanLimitDays] = useState<number>(14);

  // Success message toast
  const [showToast, setShowToast] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'locations' | 'status' | 'general'>('inventory');

  // Load settings on mount
  useEffect(() => {
    // Inventory Settings
    const storedGoal = localStorage.getItem('settings_defaultGoal');
    if (storedGoal) setDefaultGoal(parseInt(storedGoal) || 5);
    
    const storedCrit = localStorage.getItem('settings_criticalThreshold');
    if (storedCrit) setCriticalThreshold(parseInt(storedCrit) || 3);

    const storedNegative = localStorage.getItem('settings_allowNegativeQty');
    if (storedNegative) setAllowNegativeQty(storedNegative === 'true');

    const storedBarcode = localStorage.getItem('settings_autoBarcodeRequired');
    if (storedBarcode) setAutoBarcodeRequired(storedBarcode === 'true');

    // Location Settings
    const storedRackLevels = localStorage.getItem('settings_defaultRackLevels');
    if (storedRackLevels) setDefaultRackLevels(parseInt(storedRackLevels) || 3);

    const storedZoneHighlights = localStorage.getItem('settings_showZoneHighlights');
    if (storedZoneHighlights) setShowZoneHighlights(storedZoneHighlights === 'true');

    const storedGridSize = localStorage.getItem('settings_gridSize');
    if (storedGridSize) setGridSize(storedGridSize as any);

    const storedPreset = localStorage.getItem('settings_perspectivePreset');
    if (storedPreset) setPerspectivePreset(storedPreset as any);

    // Status Settings
    const storedAutoRestock = localStorage.getItem('settings_autoRestockOnDelete');
    if (storedAutoRestock) setAutoRestockOnDelete(storedAutoRestock === 'true');

    const storedStatusLoc = localStorage.getItem('settings_defaultStatusLocation');
    if (storedStatusLoc) setDefaultStatusLocation(storedStatusLoc || 'Client');

    const storedRestrict = localStorage.getItem('settings_restrictToCatalog');
    if (storedRestrict) setRestrictToCatalog(storedRestrict === 'true');

    const storedLimitDays = localStorage.getItem('settings_defaultLoanLimitDays');
    if (storedLimitDays) setDefaultLoanLimitDays(parseInt(storedLimitDays) || 14);

    const unsub = auth.onAuthStateChanged(u => setUser(u));
    return () => unsub();
  }, []);

  // Save changes handler
  const handleSave = () => {
    // Save Inventory values
    localStorage.setItem('settings_defaultGoal', String(defaultGoal));
    localStorage.setItem('settings_criticalThreshold', String(criticalThreshold));
    localStorage.setItem('settings_allowNegativeQty', String(allowNegativeQty));
    localStorage.setItem('settings_autoBarcodeRequired', String(autoBarcodeRequired));

    // Save Location values
    localStorage.setItem('settings_defaultRackLevels', String(defaultRackLevels));
    localStorage.setItem('settings_showZoneHighlights', String(showZoneHighlights));
    localStorage.setItem('settings_gridSize', gridSize);
    localStorage.setItem('settings_perspectivePreset', perspectivePreset);

    // Save Status values
    localStorage.setItem('settings_autoRestockOnDelete', String(autoRestockOnDelete));
    localStorage.setItem('settings_defaultStatusLocation', defaultStatusLocation);
    localStorage.setItem('settings_restrictToCatalog', String(restrictToCatalog));
    localStorage.setItem('settings_defaultLoanLimitDays', String(defaultLoanLimitDays));

    // Notify user
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    // Fire standard tab change or custom settings-updated event so other system files sync immediately
    window.dispatchEvent(new CustomEvent('settings-updated'));
  };

  // Restore factory profiles
  const handleReset = () => {
    if (window.confirm("Are you sure you want to reset all configurations to corporate defaults?")) {
      setDefaultGoal(5);
      setCriticalThreshold(3);
      setAllowNegativeQty(false);
      setAutoBarcodeRequired(false);

      setDefaultRackLevels(3);
      setShowZoneHighlights(true);
      setGridSize('medium');
      setPerspectivePreset('default');

      setAutoRestockOnDelete(true);
      setDefaultStatusLocation('Client');
      setRestrictToCatalog(false);
      setDefaultLoanLimitDays(14);

      // Instantly write defaults
      localStorage.setItem('settings_defaultGoal', '5');
      localStorage.setItem('settings_criticalThreshold', '3');
      localStorage.setItem('settings_allowNegativeQty', 'false');
      localStorage.setItem('settings_autoBarcodeRequired', 'false');
      localStorage.setItem('settings_defaultRackLevels', '3');
      localStorage.setItem('settings_showZoneHighlights', 'true');
      localStorage.setItem('settings_gridSize', 'medium');
      localStorage.setItem('settings_perspectivePreset', 'default');
      localStorage.setItem('settings_autoRestockOnDelete', 'true');
      localStorage.setItem('settings_defaultStatusLocation', 'Client');
      localStorage.setItem('settings_restrictToCatalog', 'false');
      localStorage.setItem('settings_defaultLoanLimitDays', '14');

      window.dispatchEvent(new CustomEvent('settings-updated'));
      
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-transparent -m-6 p-6 space-y-6 pb-24 text-[var(--neo-text)] transition-colors duration-250">
      {/* Toast alert */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-4 py-3 rounded-xl shadow-lg text-xs font-bold font-sans"
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Operational settings saved successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${
        isDark ? "border-[#25272c]" : "border-slate-200"
      }`}>
        <div>
          <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2.5 ${isDark ? "text-white" : "text-slate-800"}`}>
            <SettingsIcon className={`w-6 h-6 shrink-0 ${isDark ? "text-[#c5f82a]" : "text-slate-600"}`} />
            <span>Corporate Settings</span>
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Fine-tune inventory goals, spatial 3D grids, and real-time transaction tracking modules.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={handleReset}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border font-bold text-[11px] uppercase tracking-wider transition-all active:scale-95 ${
              isDark ? "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "border-slate-250 bg-white hover:bg-slate-50 text-slate-705"
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Defaults</span>
          </button>
          <button 
            type="button"
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-extrabold text-[11px] uppercase tracking-wider transition-all shadow-md active:scale-95 ${
              isDark ? "bg-[#c5f82a] hover:bg-[#b0df22] text-slate-900 shadow-none" : "bg-[#f05a3e] hover:bg-[#d44327] text-white"
            }`}
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Navigation Tabs List */}
        <aside className={`lg:col-span-1 border rounded-2xl p-4 shadow-sm space-y-1 ${
          isDark ? "bg-[#1c1d21] border-[#25272c]" : "bg-white border-slate-200"
        }`}>
          <p className={`text-[9px] font-extrabold uppercase tracking-widest px-3 mb-2 ${isDark ? "text-[#c5f82a]" : "text-slate-400"}`}>Category Configurations</p>
          
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all text-left ${
              activeTab === 'inventory' 
                ? (isDark ? 'bg-[#c5f82a]/10 text-[#c5f82a] border-l-4 border-[#c5f82a]' : 'bg-orange-50/70 text-[#f05a3e] border-l-4 border-[#f05a3e]') 
                : (isDark ? 'text-zinc-400 hover:bg-zinc-800/30' : 'text-slate-600 hover:bg-slate-50')
            }`}
          >
            <Package className={`w-4 h-4 ${activeTab === 'inventory' ? (isDark ? 'text-[#c5f82a]' : 'text-[#f05a3e]') : 'text-slate-400'}`} />
            <div>
              <p className="font-extrabold">2. Inventory Catalog</p>
              <p className="text-[9px] text-slate-450 font-medium">Quantities, goals & barcode alerts</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('locations')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all text-left ${
              activeTab === 'locations' 
                ? (isDark ? 'bg-[#c5f82a]/10 text-[#c5f82a] border-l-4 border-[#c5f82a]' : 'bg-orange-50/70 text-[#f05a3e] border-l-4 border-[#f05a3e]') 
                : (isDark ? 'text-zinc-400 hover:bg-zinc-800/30' : 'text-slate-600 hover:bg-slate-50')
            }`}
          >
            <MapPin className={`w-4 h-4 ${activeTab === 'locations' ? (isDark ? 'text-[#c5f82a]' : 'text-[#f05a3e]') : 'text-slate-400'}`} />
            <div>
              <p className="font-extrabold">3. Location Matrix</p>
              <p className="text-[9px] text-slate-455 font-medium">3D rack grid & structure defaults</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('status')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all text-left ${
              activeTab === 'status' 
                ? (isDark ? 'bg-[#c5f82a]/10 text-[#c5f82a] border-l-4 border-[#c5f82a]' : 'bg-orange-50/70 text-[#f05a3e] border-l-4 border-[#f05a3e]') 
                : (isDark ? 'text-zinc-400 hover:bg-zinc-800/30' : 'text-slate-600 hover:bg-slate-50')
            }`}
          >
            <ClipboardList className={`w-4 h-4 ${activeTab === 'status' ? (isDark ? 'text-[#c5f82a]' : 'text-[#f05a3e]') : 'text-slate-400'}`} />
            <div>
              <p className="font-extrabold">4. Status Tracker</p>
              <p className="text-[9px] text-slate-455 font-medium">Loans, rental audits & reservations</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all text-left ${
              activeTab === 'general' 
                ? (isDark ? 'bg-[#c5f82a]/10 text-[#c5f82a] border-l-4 border-[#c5f82a]' : 'bg-orange-50/70 text-[#f05a3e] border-l-4 border-[#f05a3e]') 
                : (isDark ? 'text-zinc-400 hover:bg-zinc-800/30' : 'text-slate-600 hover:bg-slate-50')
            }`}
          >
            <Globe className={`w-4 h-4 ${activeTab === 'general' ? (isDark ? 'text-[#c5f82a]' : 'text-[#f05a3e]') : 'text-slate-400'}`} />
            <div>
              <p className="font-extrabold">System & Auth</p>
              <p className="text-[9px] text-slate-455 font-medium">Database state & profile stats</p>
            </div>
          </button>
        </aside>

        {/* Configurations Fields Frame */}
        <section className={`lg:col-span-3 border rounded-2xl p-6 min-h-[420px] shadow-sm ${
          isDark ? "bg-[#1c1d21] border-[#25272c]" : "bg-white border-slate-200"
        }`}>
          {activeTab === 'inventory' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className={`border-b pb-3 ${isDark ? "border-zinc-800" : "border-slate-100"}`}>
                <h3 className={`text-sm font-black uppercase flex items-center gap-1.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                  <Package className="w-4 h-4 text-slate-500" />
                  <span>Inventory Catalog Configurations</span>
                </h3>
                <p className={`text-[10px] uppercase tracking-widest font-bold mt-1 ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Rule adjustments for global stocks, defaults, and catalog additions</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Default restocking goal threshold */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase block ${isDark ? "text-[#c5f82a]" : "text-slate-550"}`}>Default Minimum Goal Stock Threshold</label>
                  <p className={`text-[11px] leading-normal ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Defines the target restock amount applied instantly to brand-new inventory. Sets the default alert trigger value.</p>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      min="1" 
                      max="100" 
                      value={defaultGoal}
                      onChange={e => setDefaultGoal(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`w-24 px-3 py-2 border rounded-lg text-xs font-bold font-mono outline-none transition-all ${
                        isDark ? "bg-[#111215] border-zinc-700 text-white focus:border-[#c5f82a]" : "bg-white border-slate-205 text-slate-755 focus:border-blue-500"
                      }`}
                    />
                    <span className="text-[11px] text-slate-400 font-semibold">Standard corporate alert default is 5 units</span>
                  </div>
                </div>

                {/* Critical shortage threshold */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase block ${isDark ? "text-[#c5f82a]" : "text-slate-550"}`}>Critical Level Alert Threshold</label>
                  <p className={`text-[11px] leading-normal ${isDark ? "text-zinc-400" : "text-slate-455"}`}>Highlights specific stock entries in extreme red values on your dashboard when availability sinks below this line.</p>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      min="0" 
                      max="50" 
                      value={criticalThreshold}
                      onChange={e => setCriticalThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                      className={`w-24 px-3 py-2 border rounded-lg text-xs font-bold font-mono outline-none transition-all ${
                        isDark ? "bg-[#111215] border-zinc-700 text-white focus:border-[#c5f82a]" : "bg-white border-slate-205 text-slate-755 focus:border-blue-500"
                      }`}
                    />
                    <span className="text-[11px] text-slate-400 font-semibold">Standard corporate default is 3 units</span>
                  </div>
                </div>

                {/* Toggle - Allow negatives */}
                <div className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                  isDark ? "bg-zinc-800/20 border-zinc-700/60" : "bg-slate-50 border-slate-100"
                }`}>
                  <div className="mt-1">
                    <input 
                      id="allowNegativeQty"
                      type="checkbox" 
                      checked={allowNegativeQty}
                      onChange={e => setAllowNegativeQty(e.target.checked)}
                      className="w-4 h-4 text-[#f05a3e] border-slate-250 rounded focus:ring-[#f05a3e] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label htmlFor="allowNegativeQty" className={`text-xs font-extrabold cursor-pointer flex items-center gap-1.5 uppercase ${isDark ? "text-white" : "text-slate-800"}`}>
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                      <span>Allow Negative Warehouse Counts</span>
                    </label>
                    <p className={`text-[10.5px] leading-normal mt-1 ${isDark ? "text-zinc-400" : "text-slate-455"}`}>If enabled, the system allows transactions to complete even if stock quantities drop below zero (discrepancy tracking).</p>
                  </div>
                </div>

                {/* Toggle - Barcodes required */}
                <div className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                  isDark ? "bg-zinc-800/20 border-zinc-700/60" : "bg-slate-50 border-slate-100"
                }`}>
                  <div className="mt-1">
                    <input 
                      id="autoBarcodeRequired"
                      type="checkbox" 
                      checked={autoBarcodeRequired}
                      onChange={e => setAutoBarcodeRequired(e.target.checked)}
                      className="w-4 h-4 text-[#f05a3e] border-slate-250 rounded focus:ring-[#f05a3e] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label htmlFor="autoBarcodeRequired" className={`text-xs font-extrabold cursor-pointer flex items-center gap-1.5 uppercase ${isDark ? "text-white" : "text-slate-800"}`}>
                      <TrendingDown className="w-3.5 h-3.5 text-[#f05a3e]" />
                      <span>Require Sku Barcode Enforcements</span>
                    </label>
                    <p className={`text-[10.5px] leading-normal mt-1 ${isDark ? "text-zinc-400" : "text-slate-455"}`}>Prevents addition of new items to catalog without establishing a unique barcode/SKU key descriptor.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'locations' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className={`border-b pb-3 ${isDark ? "border-zinc-800" : "border-slate-100"}`}>
                <h3 className={`text-sm font-black uppercase flex items-center gap-1.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <span>3D Layout & Location Matrix Coordinates</span>
                </h3>
                <p className={`text-[10px] uppercase tracking-widest font-bold mt-1 ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Configure layout densities, camera views, and default structure settings</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Default rack levels shelf tiers count */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase block ${isDark ? "text-[#c5f82a]" : "text-slate-555"}`}>New Racks Level Shelf Count</label>
                  <p className={`text-[11px] leading-normal ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Specific default deck tiers generated automatically when adding new structural storage cabinets inside the 3D studio.</p>
                  <div className="flex items-center gap-3">
                    <select 
                      value={defaultRackLevels}
                      onChange={e => setDefaultRackLevels(parseInt(e.target.value) || 3)}
                      className={`w-32 px-3 py-2 border rounded-lg text-xs font-bold outline-none transition-all ${
                        isDark ? "bg-[#111215] border-zinc-700 text-white focus:border-[#c5f82a]" : "bg-white border-slate-205 text-slate-755"
                      }`}
                    >
                      <option value="2">2 Tiers (Low)</option>
                      <option value="3">3 Tiers (Standard)</option>
                      <option value="4">4 Tiers (High)</option>
                      <option value="5">5 Tiers (Industrial)</option>
                      <option value="6">6 Tiers (Extra-High)</option>
                    </select>
                  </div>
                </div>

                {/* Perspective View options */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase block font-sans ${isDark ? "text-[#c5f82a]" : "text-slate-555"}`}>Default 3D Camera Angles</label>
                  <p className={`text-[11px] leading-normal ${isDark ? "text-zinc-400" : "text-slate-450"}`}>The default perspective angle preset triggered immediately upon entering the 3D Location visualizer map screen.</p>
                  <div>
                    <select 
                      value={perspectivePreset}
                      onChange={e => setPerspectivePreset(e.target.value as any)}
                      className={`w-48 px-3 py-2 border rounded-lg text-xs font-bold outline-none transition-all ${
                        isDark ? "bg-[#111215] border-zinc-700 text-white focus:border-[#c5f82a]" : "bg-white border-slate-205 text-slate-755"
                      }`}
                    >
                      <option value="default">Strategic Perspective Angle</option>
                      <option value="top">Orthographic Ortho-Top</option>
                      <option value="isometric">Engineering isometric View</option>
                    </select>
                  </div>
                </div>

                {/* Grid Density size */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase block ${isDark ? "text-[#c5f82a]" : "text-slate-555"}`}>Spatial Floor Grid Density</label>
                  <p className={`text-[11px] leading-normal ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Alters visual grid spacing parameters rendered across three-dimensional warehouse space layouts.</p>
                  <div>
                    <select 
                      value={gridSize}
                      onChange={e => setGridSize(e.target.value as any)}
                      className={`w-48 px-3 py-2 border rounded-lg text-xs font-bold outline-none transition-all ${
                        isDark ? "bg-[#111215] border-zinc-700 text-white focus:border-[#c5f82a]" : "bg-white border-slate-205 text-slate-755"
                      }`}
                    >
                      <option value="small">Sparse (Cell size: 2m)</option>
                      <option value="medium">Standard (Cell size: 1m)</option>
                      <option value="large">Fine-Grained (Cell size: 0.5m)</option>
                    </select>
                  </div>
                </div>

                {/* Toggle - Show zone labels/colors */}
                <div className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                  isDark ? "bg-zinc-800/20 border-zinc-700/60" : "bg-slate-50 border-slate-100"
                }`}>
                  <div className="mt-1">
                    <input 
                      id="showZoneHighlights"
                      type="checkbox" 
                      checked={showZoneHighlights}
                      onChange={e => setShowZoneHighlights(e.target.checked)}
                      className="w-4 h-4 text-[#f05a3e] border-slate-250 rounded focus:ring-[#f05a3e] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label htmlFor="showZoneHighlights" className={`text-xs font-extrabold cursor-pointer flex items-center gap-1.5 uppercase ${isDark ? "text-white" : "text-slate-800"}`}>
                      <Eye className="w-3.5 h-3.5 text-violet-500" />
                      <span>Enable Heatmap Zone Color Overlays</span>
                    </label>
                    <p className={`text-[10.5px] leading-normal mt-1 ${isDark ? "text-zinc-400" : "text-slate-455"}`}>Draws colored floor plates indicating active physical sectors (North End, Central Bay, South End) over the grid floor.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'status' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className={`border-b pb-3 ${isDark ? "border-zinc-800" : "border-slate-100"}`}>
                <h3 className={`text-sm font-black uppercase flex items-center gap-1.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                  <ClipboardList className="w-4 h-4 text-slate-500" />
                  <span>Loans & Transactions Tracker Settings</span>
                </h3>
                <p className={`text-[10px] uppercase tracking-widest font-bold mt-1 ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Calibrate active rentals, loan grace boundaries, and reservation handovers</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Default status assigned destination */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase block ${isDark ? "text-[#c5f82a]" : "text-slate-550"}`}>Standard Hold Location / Warehouse</label>
                  <p className={`text-[11px] leading-normal ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Default destination state set automatically during creation of status records.</p>
                  <div>
                    <select 
                      value={defaultStatusLocation}
                      onChange={e => setDefaultStatusLocation(e.target.value)}
                      className={`w-48 px-3 py-2 border rounded-lg text-xs font-bold outline-none transition-all ${
                        isDark ? "bg-[#111215] border-zinc-700 text-white focus:border-[#c5f82a]" : "bg-white border-slate-205 text-slate-755"
                      }`}
                    >
                      <option value="Client">Client Site</option>
                      <option value="On the way back">On the way back</option>
                      <option value="Office">Office Admin</option>
                      <option value="Old warehouse">Old warehouse</option>
                      <option value="New warehouse">New warehouse</option>
                    </select>
                  </div>
                </div>

                {/* Default loan grace period days */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase block ${isDark ? "text-[#c5f82a]" : "text-slate-555"}`}>Due Rental Grace Interval Limits</label>
                  <p className={`text-[11px] leading-normal ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Defines standard loan periods (in calendar days) automatically flagged for auditor checks.</p>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      min="1" 
                      max="180" 
                      value={defaultLoanLimitDays}
                      onChange={e => setDefaultLoanLimitDays(Math.max(1, parseInt(e.target.value) || 14))}
                      className={`w-24 px-3 py-2 border rounded-lg text-xs font-bold font-mono outline-none transition-all ${
                        isDark ? "bg-[#111215] border-zinc-700 text-white focus:border-[#c5f82a]" : "bg-white border-slate-205 text-slate-755 focus:border-blue-500"
                      }`}
                    />
                    <span className="text-[11px] text-slate-400 font-semibold">Standard corporate timeline: 14 days</span>
                  </div>
                </div>

                {/* Toggle - Auto-restock */}
                <div className={`flex items-start gap-4 p-4 rounded-xl border transition-colors col-span-1 ${
                  isDark ? "bg-zinc-800/20 border-zinc-700/60" : "bg-slate-50 border-slate-100"
                }`}>
                  <div className="mt-1">
                    <input 
                      id="autoRestockOnDelete"
                      type="checkbox" 
                      checked={autoRestockOnDelete}
                      onChange={e => setAutoRestockOnDelete(e.target.checked)}
                      className="w-4 h-4 text-[#f05a3e] border-slate-250 rounded focus:ring-[#f05a3e] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label htmlFor="autoRestockOnDelete" className={`text-xs font-extrabold cursor-pointer flex items-center gap-1.5 uppercase ${isDark ? "text-white" : "text-slate-800"}`}>
                      <Sliders className="w-3.5 h-3.5 text-teal-600" />
                      <span>Auto-Restore Stocks on Deletion</span>
                    </label>
                    <p className={`text-[10.5px] leading-normal mt-1 ${isDark ? "text-zinc-400" : "text-slate-455"}`}>If active, deleting a "Reserved" status record automatically restores deducted shelf units to active warehouse inventory records.</p>
                  </div>
                </div>

                {/* Toggle - Restrict custom items */}
                <div className={`flex items-start gap-4 p-4 rounded-xl border transition-colors col-span-1 ${
                  isDark ? "bg-zinc-800/20 border-zinc-700/60" : "bg-slate-50 border-slate-100"
                }`}>
                  <div className="mt-1">
                    <input 
                      id="restrictToCatalog"
                      type="checkbox" 
                      checked={restrictToCatalog}
                      onChange={e => setRestrictToCatalog(e.target.checked)}
                      className="w-4 h-4 text-[#f05a3e] border-slate-250 rounded focus:ring-[#f05a3e] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label htmlFor="restrictToCatalog" className={`text-xs font-extrabold cursor-pointer flex items-center gap-1.5 uppercase ${isDark ? "text-white" : "text-slate-800"}`}>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                      <span>Restrict Status Items to Catalog</span>
                    </label>
                    <p className={`text-[10.5px] leading-normal mt-1 ${isDark ? "text-zinc-400" : "text-slate-455"}`}>Disallows typing custom or custom items in status forms, enforcing selection strictly from corporate inventory items.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className={`border-b pb-3 ${isDark ? "border-zinc-800" : "border-slate-100"}`}>
                <h3 className={`text-sm font-black uppercase flex items-center gap-1.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                  <Globe className="w-4 h-4 text-slate-500" />
                  <span>Corporate Connection & Tenant Authentication</span>
                </h3>
                <p className={`text-[10px] uppercase tracking-widest font-bold mt-1 ${isDark ? "text-zinc-400" : "text-slate-450"}`}>Inspect operational environment statistics and active database clusters</p>
              </div>

              <div className="space-y-5">
                <div className={`rounded-xl p-4 space-y-3 border transition-colors ${
                  isDark ? "bg-[#111215]/60 border-zinc-750 text-white" : "bg-slate-50 border-slate-200 text-slate-850"
                }`}>
                  <div className={`flex items-center gap-2 border-b pb-2 ${isDark ? "border-zinc-800 text-[#c5f82a]" : "border-slate-150 text-indigo-900"}`}>
                    <Database className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase">Cloud Cluster Integrity</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Database Provider</span>
                      <span className={`font-bold flex items-center gap-1.5 ${isDark ? "text-zinc-100" : "text-slate-705"}`}>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Google Firestore Cluster & RTDB (Dual Synchronized)
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-400 block font-sans">Network Status</span>
                      <span className={`font-bold font-mono text-[11px] uppercase tracking-wider ${isDark ? "text-zinc-100" : "text-slate-705"}`}>Connected • Corporate Sync Active</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Active Auditor Profile</span>
                      <span className={`font-bold flex items-center gap-1.5 ${isDark ? "text-zinc-200" : "text-slate-705"}`}>
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {user?.email || (user?.isAnonymous ? 'Authorized Corporate Guest (Anonymous)' : 'Not Authorized')}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-400 block font-mono">Telemetry Host</span>
                      <span className={`font-bold font-mono text-[10.5px] ${isDark ? "text-zinc-350" : "text-slate-705"}`}>epedu-inventory-database.web.app</span>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-xl space-y-2 border transition-colors ${
                  isDark ? "bg-rose-950/10 border-rose-900/30 text-rose-200" : "bg-rose-50/30 border-rose-200/50 text-rose-700"
                }`}>
                  <h4 className={`text-xs font-black uppercase flex items-center gap-1.5 ${isDark ? "text-rose-400" : "text-rose-800"}`}>
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Extreme Maintenance Operations</span>
                  </h4>
                  <p className={`text-[11px] leading-relaxed ${isDark ? "text-rose-300" : "text-rose-700/80"}`}>
                    These operations write static testing metrics to your Cloud databases or purge cached user metrics. Proceed with extreme diligence under nexus directive protocols.
                  </p>
                  <div>
                    <button 
                      type="button"
                      onClick={() => alert("Please consult your system administrator. Catalog structural locks remain globally authoritative.")}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] uppercase tracking-widest px-4 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Audit Purge Database
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
