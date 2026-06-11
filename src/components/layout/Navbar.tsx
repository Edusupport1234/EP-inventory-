import React from 'react';
import { Search, Bell, User, Menu, LogOut } from 'lucide-react';

interface NavbarProps {
  toggleSidebar: () => void;
  onLogout?: () => void;
}

export default function Navbar({ toggleSidebar, onLogout }: NavbarProps) {
  const username = localStorage.getItem('epedu_username') || 'Admin User';
  const initial = username.substring(0, 2).toUpperCase();

  return (
    <header className="h-16 bg-[#f4f5f7] sticky top-0 z-30 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleSidebar}
          className="p-2 hover:bg-slate-100 rounded lg:hidden"
        >
          <Menu className="w-5 h-5 text-slate-600" />
        </button>
        
        <div className="hidden md:flex items-center bg-slate-100 rounded-full px-4 py-2 w-72 transition-all">
          <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
          <input 
            type="text" 
            placeholder="Search SKU or Product..." 
            className="bg-transparent border-none outline-none text-xs text-slate-700 w-full font-medium"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="p-2 hover:bg-slate-100 rounded-full relative">
          <Bell className="w-5 h-5 text-slate-600" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
        </button>
        
        <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
        
        {/* Dynamic User Profile Indicator */}
        <div className="flex items-center gap-2.5 p-1 px-2.5 bg-slate-50 border border-slate-100 rounded-xl select-none">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black uppercase shadow-xs ${
            localStorage.getItem('epedu_role') === 'viewer' ? 'bg-amber-500' : 'bg-[#f05a3e]'
          }`}>
            {initial}
          </div>
          <div className="hidden sm:block text-left mr-1">
            <p className="text-xs font-bold text-slate-800 leading-none">{username}</p>
            <p className={`text-[8px] font-black uppercase tracking-widest leading-none mt-1.5 ${
              localStorage.getItem('epedu_role') === 'viewer' ? 'text-amber-500' : 'text-slate-400'
            }`}>
              {localStorage.getItem('epedu_role') === 'viewer' ? 'Viewer (Read-Only)' : (localStorage.getItem('epedu_role') === 'super_admin' ? 'Super Admin' : 'Manager')}
            </p>
          </div>
        </div>

        {/* Unified Top-Right Logout Button */}
        {onLogout && (
          <button 
            onClick={onLogout}
            className="flex items-center gap-1.5 p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-100 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
            title="Sign Out of EP Inventory"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider hidden md:inline pr-1">Logout</span>
          </button>
        )}
      </div>
    </header>
  );
}
