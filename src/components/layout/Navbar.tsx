import React from 'react';
import { Search, Bell, User, Menu } from 'lucide-react';

interface NavbarProps {
  toggleSidebar: () => void;
}

export default function Navbar({ toggleSidebar }: NavbarProps) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-6">
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
        
        <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
        
        <button className="flex items-center gap-3 p-1.5 hover:bg-slate-100 rounded-full transition-all">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <div className="hidden sm:block text-left mr-2">
            <p className="text-xs font-semibold text-slate-800 leading-none">Admin User</p>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Super Manager</p>
          </div>
        </button>
      </div>
    </header>
  );
}
