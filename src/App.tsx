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
import { getDoc, updateDoc } from 'firebase/firestore';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('epedu_theme') as 'light' | 'dark') || 'light';
  });

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('epedu_theme', next);
      return next;
    });
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('epedu_auth') === 'true';
  });
  
  // Custom warning modal state for "Viewer" role attempting restricted modifications
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);
  const [attemptedAction, setAttemptedAction] = useState('');

  const username = localStorage.getItem('epedu_username');
  const role = localStorage.getItem('epedu_role') || '';
  const isViewer = role === 'viewer';

  const handleLogout = () => {
    localStorage.removeItem('epedu_auth');
    localStorage.removeItem('epedu_username');
    localStorage.removeItem('epedu_role');
    setIsAuthenticated(false);
  };

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

        // Verify that the user still exists in Firestore before heartbeating.
        // This prevents deleted standard accounts from automatically being recreated by an active browser session.
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            lastActive: new Date().toISOString(),
          });
        } else {
          // If the account has been deleted permanently (and isn't the fallback system admin), trigger a secure logout.
          if (lowerUser !== 'epedu' && lowerUser !== 'admin') {
            console.warn("Logged-in user account was deleted from database. Performing self-logout.");
            handleLogout();
          }
        }
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
    <div className={`min-h-screen flex font-sans transition-colors duration-300 ${
      theme === 'dark' 
        ? 'bg-[#111215] text-[#e3e5e8] dark' 
        : 'bg-[#f8f7f4] text-slate-900'
    }`}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onLogout={handleLogout}
        theme={theme}
      />
      
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        {isViewer && (
          <div className="bg-amber-500 text-white text-[11px] font-black py-2.5 px-6 sticky top-0 z-40 flex items-center justify-center gap-2 uppercase tracking-widest shadow-sm border-b border-amber-600 select-none">
            <span>🔒 EP INVENTORY GAUNTLET — READ-ONLY MODE ACTIVE 🚫</span>
          </div>
        )}
        <Navbar 
          toggleSidebar={toggleSidebar} 
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {activeTab === 'dashboard' && <Dashboard theme={theme} />}
          {activeTab === 'inventory' && <Inventory theme={theme} />}
          {activeTab === 'locations' && <Locations theme={theme} />}
          {activeTab === 'status' && <Status theme={theme} />}
          {activeTab === 'history' && <History theme={theme} />}
          {activeTab === 'settings' && <Settings theme={theme} />}
          {activeTab === 'accounts' && <Accounts theme={theme} />}
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
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden text-center p-8 lg:p-10 z-[101]"
            >
              {/* Absoluted close button */}
              <button 
                onClick={() => setShowUnauthorizedModal(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-50 transition-colors cursor-pointer outline-none"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Icon Container with bouncing pulse */}
              <div className="mx-auto w-24 h-24 bg-rose-50 rounded-[24px] flex items-center justify-center text-rose-500 mb-5 relative">
                <div className="absolute inset-0 border border-rose-300 rounded-[24px] animate-ping opacity-25" />
                <span className="text-4xl">🛑</span>
              </div>

              {/* Title & Metadata (Bigger & Eye-catching) */}
              <h3 className="text-4xl md:text-5xl font-black font-sans tracking-tighter text-rose-600 uppercase leading-none">
                🚫 NO ACCESS
              </h3>
              <p className="text-xs text-amber-500 font-black tracking-widest uppercase mt-2.5 mb-6 flex items-center justify-center gap-1.5">
                <span>⚠️ VIEW-ONLY ROLE LOCK ACTIVE 🔒</span>
              </p>

              {/* Explanation Description (Less Words & Emojis) */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center space-y-3 mb-6">
                <p className="text-xs text-slate-700 font-bold">
                  🔒 Restriction: <span className="inline-flex font-mono font-black text-rose-600 bg-rose-50/50 px-2 py-0.5 rounded border border-rose-100 text-[11px] uppercase tracking-wide">{attemptedAction}</span>
                </p>
                <div className="h-[1px] bg-slate-200" />
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  ✍️ Adding, editing, or deleting is disabled.
                </p>
              </div>

              {/* Instructions */}
              <p className="text-[10px] text-slate-400 font-black mb-6 uppercase tracking-widest leading-none">
                👤 Ask Super Admin to upgrade your role 🔑
              </p>

              {/* CTA Action button */}
              <button
                type="button"
                onClick={() => setShowUnauthorizedModal(false)}
                className="w-full py-4 px-4 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.98] cursor-pointer select-none"
              >
                Okay, I understand 👍
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
