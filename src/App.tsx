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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <Navbar toggleSidebar={toggleSidebar} />
        
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'inventory' && <Inventory />}
          {activeTab === 'locations' && <Locations />}
          {activeTab === 'status' && <Status />}
          {activeTab === 'history' && <History />}
          {(activeTab === 'analytics' || activeTab === 'settings') && (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-slate-100 border-dashed">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                <span className="text-2xl opacity-50">🚧</span>
              </div>
              <h2 className="text-xl font-bold text-slate-800">Module Under Development</h2>
              <p className="text-slate-500 max-w-xs mt-2">The {activeTab} section is currently being updated to meet nexus corporate standards.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
