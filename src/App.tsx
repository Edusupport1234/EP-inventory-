/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Locations from './pages/Locations';
import Status from './pages/Status';
import History from './pages/History';
import Settings from './pages/Settings';
import LoginGate from './components/layout/LoginGate';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('epedu_auth') === 'true';
  });

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
        </main>
      </div>
    </div>
  );
}
