import React from 'react';
import { Search, Bell, User, Menu, LogOut, Sun, Moon } from 'lucide-react';

interface NavbarProps {
  toggleSidebar: () => void;
  onLogout?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export default function Navbar({ toggleSidebar, onLogout, theme = 'dark', onToggleTheme }: NavbarProps) {
  const username = localStorage.getItem('epedu_username') || 'Admin User';
  const initial = username.substring(0, 2).toUpperCase();

  const isDark = theme === 'dark';

  return (
    <header className={`h-16 sticky top-0 z-30 flex items-center justify-between px-6 transition-colors duration-300 ${
      isDark ? 'bg-[#111215] border-b border-[#24262b]' : 'bg-[#f4f5f7] border-b border-slate-200'
    }`}>
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleSidebar}
          className={`p-2 rounded lg:hidden transition-colors ${
            isDark ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-slate-100 text-slate-600'
          }`}
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <div className={`hidden md:flex items-center rounded-2xl px-3.5 py-2 w-80 border-1.5 transition-all duration-200 ${
          isDark 
            ? 'bg-[#1c1d21] border-[#25272c] focus-within:border-[#c5f82a] shadow-[1px_1px_0px_0px_rgba(0,0,0,0.5)]' 
            : 'bg-white border-[#111215] focus-within:translate-y-[-1px] focus-within:shadow-[3px_3px_0px_0px_#111215] shadow-[2px_2px_0px_0px_#111215]'
        }`}>
          <Search className={`w-4 h-4 mr-2.5 shrink-0 transition-colors duration-200 ${isDark ? 'text-zinc-400' : 'text-[#f05a3e]'}`} />
          <input 
            type="search" 
            placeholder="Search SKU or Product..." 
            className={`bg-transparent outline-none text-xs w-full font-semibold focus:ring-0 focus:outline-none p-0 border-none select-none ${
              isDark ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-slate-800 placeholder:text-slate-450'
            }`}
            style={{ border: 'none', boxShadow: 'none', background: 'transparent', outline: 'none' }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Modern Sun/Moon Theme Toggle Switcher */}
        {onToggleTheme && (
          <button 
            onClick={onToggleTheme}
            className={`p-2 rounded-xl border transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-3xs ${
              isDark 
                ? 'bg-[#1c1d21] border-[#25272c] hover:bg-[#25272c] text-[#c5f82a]' 
                : 'bg-white border-slate-200 hover:bg-slate-50 text-[#f05a3e]'
            }`}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}

        <button className={`p-2 rounded-full relative transition-colors ${
          isDark ? 'hover:bg-zinc-850 text-zinc-300' : 'hover:bg-slate-100 text-slate-600'
        }`}>
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
        </button>
        
        <div className={`h-8 w-[1px] mx-1 ${isDark ? 'bg-[#25272c]' : 'bg-slate-200'}`}></div>
        
        {/* Dynamic User Profile Indicator */}
        <div className={`flex items-center gap-2.5 p-1 px-2.5 border rounded-xl select-none transition-colors ${
          isDark ? 'bg-[#1c1d21] border-[#25272c]' : 'bg-slate-50 border-slate-100'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black uppercase shadow-xs ${
            localStorage.getItem('epedu_role') === 'viewer' 
              ? 'bg-amber-500' 
              : (isDark ? 'bg-[#c5f82a] text-black font-black' : 'bg-[#f05a3e]')
          }`}>
            {initial}
          </div>
          <div className="hidden sm:block text-left mr-1">
            <p className={`text-xs font-bold leading-none ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>{username}</p>
            <p className={`text-[8px] font-black uppercase tracking-widest leading-none mt-1.5 ${
              localStorage.getItem('epedu_role') === 'viewer' ? 'text-amber-500' : (isDark ? 'text-zinc-400' : 'text-slate-400')
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
