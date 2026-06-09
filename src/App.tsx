/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldAlert, LockKeyhole, X } from 'lucide-react';
import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Locations from './pages/Locations';
import Status from './pages/Status';
import History from './pages/History';
import Settings from './pages/Settings';
import LoginGate from './components/layout/LoginGate';
import Accounts from './pages/Accounts';
import { db, doc, setDoc } from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('epedu_auth') === 'true';
  });
  
  // Custom warning modal state for "Viewer" role attempting restricted modifications
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);
  const [attemptedAction, setAttemptedAction] = useState('');

  const username = localStorage.getItem('epedu_username');
  const role = localStorage.getItem('epedu_role') || '';
  const isViewer = role === 'viewer';

  // Listen to system-wide unauthorized action events
  useEffect(() => {
    const handleUnauthorizedEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ action: string }>;
      setAttemptedAction(customEvent.detail?.action || 'of this feature');
      setShowUnauthorizedModal(true);
    };

    window.addEventListener('show-unauthorized-modal', handleUnauthorizedEvent);
    return () => {
      window.removeEventListener('show-unauthorized-modal', handleUnauthorizedEvent);
    };
  }, []);

  React.useEffect(() => {
    if (isAuthenticated && isViewer) {
      if (!['inventory', 'locations', 'status'].includes(activeTab)) {
        setActiveTab('inventory');
      }
    }
  }, [isAuthenticated, isViewer, activeTab]);

  // Unified real-time background presence session tracking heartbeat
  React.useEffect(() => {
    if (!isAuthenticated || !username) return;

    const runHeartbeat = async () => {
      try {
        const lowerUser = username.trim().toLowerCase();
        const userRef = doc(db, 'userAccounts', lowerUser);
        await setDoc(userRef, {
          username: lowerUser,
          lastActive: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.warn("Operational background session presence sync warned:", err);
      }
    };

    runHeartbeat();
    const intervalId = setInterval(runHeartbeat, 15000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, username]);

  React.useEffect(() => {
    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail);
      }
    };
    window.addEventListener('change-tab', handleTabChange);
    return () => {
      window.removeEventListener('change-tab', handleTabChange);
    };
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  if (!isAuthenticated) {
    return <LoginGate onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onLogout={() => {
          localStorage.removeItem('epedu_auth');
          setIsAuthenticated(false);
        }}
      />
      
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <Navbar 
          toggleSidebar={toggleSidebar} 
          onLogout={() => {
            localStorage.removeItem('epedu_auth');
            localStorage.removeItem('epedu_username');
            setIsAuthenticated(false);
          }}
        />
        
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'inventory' && <Inventory />}
          {activeTab === 'locations' && <Locations />}
          {activeTab === 'status' && <Status />}
          {activeTab === 'history' && <History />}
          {activeTab === 'settings' && <Settings />}
          {activeTab === 'accounts' && <Accounts />}
        </main>
      </div>

      {/* Beautiful High-Contrast Unauthorized Role Warning Pop-out Modal */}
      <AnimatePresence>
        {showUnauthorizedModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop with blur & fade */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUnauthorizedModal(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs"
            />
            
            {/* Pop-out Card Panel with spring scale and fade */}
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ 
                scale: 1, 
                opacity: 1, 
                y: 0,
                transition: { type: 'spring', damping: 25, stiffness: 350 } 
              }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-center p-8 z-[101]"
            >
              {/* Absoluted close button */}
              <button 
                onClick={() => setShowUnauthorizedModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-50 transition-colors cursor-pointer outline-none"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Icon Container */}
              <div className="mx-auto w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-5 relative">
                <div className="absolute inset-0 border border-amber-300 rounded-2xl animate-ping opacity-20" />
                <LockKeyhole className="w-8 h-8" />
              </div>

              {/* Title & Metadata */}
              <h3 className="text-xl font-bold font-sans tracking-tight text-slate-900">
                Action Restricted
              </h3>
              <p className="text-xs text-amber-600 font-extrabold tracking-widest uppercase mt-1 mb-4 flex items-center justify-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Viewer Read-Only Active</span>
              </p>

              {/* Explanation Description */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left space-y-2.5 mb-6">
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Your current account is authenticated under the <span className="font-bold text-slate-900 underline decoration-indigo-400 decoration-2">Viewer</span> role. Permission is write-locked to secure database integrity.
                </p>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  The attempted action: <span className="inline-flex font-mono font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 text-[10px] uppercase tracking-wide">{attemptedAction}</span> is not authorized for Viewers.
                </p>
              </div>

              {/* Instructions */}
              <p className="text-[11px] text-slate-400 font-semibold mb-6 uppercase tracking-wider leading-relaxed">
                Please contact a Super Administrator or security staff to request elevated access levels.
              </p>

              {/* CTA Action button */}
              <button
                type="button"
                onClick={() => setShowUnauthorizedModal(false)}
                className="w-full py-3.5 px-4 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-98 cursor-pointer select-none"
              >
                Acknowledge and Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
