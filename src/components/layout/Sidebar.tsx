import React from 'react';
import { LayoutDashboard, Package, MapPin, Settings, BarChart3, LogOut, Menu, History, ClipboardList, Bookmark } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'inventory', icon: Package, label: 'Inventory' },
    { id: 'locations', icon: MapPin, label: 'Location' },
    { id: 'status', icon: ClipboardList, label: 'Status' },
    { id: 'history', icon: History, label: 'History' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed top-0 left-0 h-full bg-white border-r border-slate-200 z-50 transition-all duration-300 ease-in-out",
        isOpen ? "w-64" : "w-20",
        !isOpen && "lg:block hidden",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="h-16 flex items-center px-6 border-b border-slate-100">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shrink-0">
              <div className="w-4 h-4 border-2 border-white rotate-45"></div>
            </div>
            {isOpen && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="ml-3 font-bold text-slate-800 text-lg tracking-tight whitespace-nowrap"
              >
                STRATOS<span className="font-normal text-slate-500">CORE</span>
              </motion.span>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (window.innerWidth < 1024) setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center p-3 rounded-md transition-all group",
                  activeTab === item.id 
                    ? "bg-slate-100 border-r-4 border-blue-600 text-slate-900" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 shrink-0 transition-transform group-hover:scale-110",
                  activeTab === item.id ? "text-blue-600" : "text-slate-400"
                )} />
                {isOpen && (
                  <motion.span 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="ml-3 font-medium whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
                {activeTab === item.id && isOpen && (
                  <motion.div 
                    layoutId="active-pill"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600"
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Bottom Menu */}
          <div className="p-3 border-t border-slate-100">
            <button className="w-full flex items-center p-3 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all">
              <LogOut className="w-5 h-5 shrink-0" />
              {isOpen && <span className="ml-3 font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
