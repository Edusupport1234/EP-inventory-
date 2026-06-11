import React from 'react';
import { LayoutDashboard, Package, MapPin, Settings, BarChart3, LogOut, Menu, History, ClipboardList, Users } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onLogout?: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen, onLogout }: SidebarProps) {
  const username = localStorage.getItem('epedu_username') || '';
  const role = localStorage.getItem('epedu_role') || '';
  const isSuperAdmin = username.toLowerCase() === 'admin' || username.toLowerCase() === 'epedu' || role === 'super_admin';

  let menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'inventory', icon: Package, label: 'Inventory' },
    { id: 'locations', icon: MapPin, label: 'Location Map' },
    { id: 'status', icon: ClipboardList, label: 'Status' },
    { id: 'history', icon: History, label: 'History Logs' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  if (isSuperAdmin) {
    menuItems.push({ id: 'accounts', icon: Users, label: 'Account List' });
  }

  if (role === 'viewer') {
    menuItems = menuItems.filter(item => ['inventory', 'locations', 'status'].includes(item.id));
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/10 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed top-0 left-0 h-full bg-[#f4f5f7] border-r border-[#eef0f3] z-50 transition-all duration-300 ease-in-out select-none",
        isOpen ? "w-64" : "w-20",
        !isOpen && "lg:block hidden",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full py-4">
          {/* Logo Section */}
          <div className="h-16 flex items-center px-6 mb-4">
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center shrink-0 shadow-sm relative">
              {/* Geometric style resembling the logo in the picture */}
              <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-slate-900 rotate-45" />
              </div>
            </div>
            {isOpen && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="ml-3 font-display font-black text-slate-800 text-base tracking-tight whitespace-nowrap uppercase"
              >
                EP <span className="font-normal text-slate-500 lowercase">supply</span>
              </motion.span>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-1.5">
            {menuItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center p-3 rounded-2xl transition-all group relative cursor-pointer",
                    isActive 
                      ? "bg-white text-slate-900 shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-[#eef0f3]" 
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  )}
                >
                  {/* Selected Indicator Highlight Bar */}
                  {isActive && (
                    <div 
                      className="absolute left-0 top-3 bottom-3 w-1 bg-[#f05a3e] rounded-r-full"
                    />
                  )}

                  <item.icon className={cn(
                    "w-5 h-5 shrink-0 transition-transform group-hover:scale-105",
                    isActive ? "text-[#f05a3e]" : "text-slate-400"
                  )} />
                  {isOpen && (
                    <motion.span 
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="ml-3 text-xs font-semibold whitespace-nowrap tracking-wide capitalize"
                    >
                      {item.label}
                    </motion.span>
                  )}
                  {isActive && isOpen && (
                    <motion.div 
                      layoutId="active-pill"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-[#f05a3e]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom Branding Info */}
          <div className="px-6 py-4 mt-auto border-t border-slate-200/50">
            {isOpen ? (
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block leading-none">EP Supply Chain</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 block leading-none text-center">EP</span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
