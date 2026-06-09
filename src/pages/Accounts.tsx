import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Key, Shield, Trash2, Search, Check, AlertCircle, 
  Clock, LogOut, ShieldCheck, RefreshCw, UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/src/lib/firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

interface UserAccount {
  id: string;
  username: string;
  password?: string;
  role: 'super_admin' | 'user' | 'viewer';
  lastActive?: string;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Form states for creating a new account
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'super_admin' | 'user' | 'viewer'>('user');
  const [formError, setFormError] = useState<string | null>(null);

  // States for changing password
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [updatedUsername, setUpdatedUsername] = useState('');
  const [updatedPassword, setUpdatedPassword] = useState('');
  const [updatedRole, setUpdatedRole] = useState<'super_admin' | 'user' | 'viewer'>('user');
  const [changePassError, setChangePassError] = useState<string | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // States for general feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'refreshed'>('success');

  // Timer reference for local clock sync
  const [currentTime, setCurrentTime] = useState(new Date());

  // Listen to accounts list in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'userAccounts'), (snapshot) => {
      const uList: UserAccount[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        uList.push({
          id: doc.id,
          username: data.username || doc.id,
          password: data.password || '',
          role: data.role || 'user',
          lastActive: data.lastActive || '',
        });
      });

      // If the bootstrap admin account isn't initialized yet inside firestore, list it virtual or auto-inject
      if (!uList.some(u => u.username.toLowerCase() === 'epadmin' || u.id.toLowerCase() === 'epadmin')) {
        uList.unshift({
          id: 'EPADMIN',
          username: 'EPADMIN',
          password: '123456',
          role: 'super_admin',
          lastActive: new Date().toISOString(),
        });
      }

      // Deduplicate to guarantee absolute unique keys by lowercase id and lowercase username
      const deduplicated: UserAccount[] = [];
      const seenIds = new Set<string>();
      const seenUsernames = new Set<string>();

      uList.forEach(user => {
        const idLower = user.id.toLowerCase();
        const usernameLower = user.username.toLowerCase();
        if (!seenIds.has(idLower) && !seenUsernames.has(usernameLower)) {
          seenIds.add(idLower);
          seenUsernames.add(usernameLower);
          deduplicated.push(user);
        }
      });

      setAccounts(deduplicated);
      setIsLoading(false);
    }, (error) => {
      console.error("Error loaded user accounts list:", error);
      setIsLoading(false);
    });

    // Sync current time every few seconds to refresh relative "online status" indicators
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const triggerToast = (msg: string, type: 'success' | 'refreshed' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Create clean account entry
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const checkUser = newUsername.trim().toLowerCase();
    const checkPass = newPassword.trim();

    if (!checkUser || !checkPass) {
      setFormError("Both username and password credentials are required.");
      return;
    }

    if (checkUser.length < 3) {
      setFormError("Username must be at least 3 characters long.");
      return;
    }

    if (checkPass.length < 4) {
      setFormError("Password must be at least 4 characters long.");
      return;
    }

    // Check if user already exists
    if (accounts.some(acc => acc.username.toLowerCase() === checkUser)) {
      setFormError("An account with this username already exists.");
      return;
    }

    try {
      const userRef = doc(db, 'userAccounts', checkUser);
      await setDoc(userRef, {
        username: checkUser,
        password: checkPass,
        role: newRole,
        lastActive: '',
      });

      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      triggerToast(`Account for "${checkUser}" created successfully!`);
    } catch (err: any) {
      setFormError(`Failed to register account: ${err.message || err}`);
    }
  };

  // Update general details of selected user account
  const handleUpdateAccountDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError(null);

    if (!selectedUser) return;
    
    const checkUser = updatedUsername.trim().toLowerCase();
    const checkPass = updatedPassword.trim();
    const targetRole = updatedRole;

    if (!checkUser) {
      setChangePassError("Username cannot be empty.");
      return;
    }

    if (checkUser.length < 3) {
      setChangePassError("Username must be at least 3 characters long.");
      return;
    }

    if (checkPass.length < 4) {
      setChangePassError("Password must be at least 4 characters long.");
      return;
    }

    // If username is changing, ensure it's not a duplicate
    const oldUsernameLower = selectedUser.username.toLowerCase();
    
    // Protect EPADMIN username from being changed online
    if (oldUsernameLower === 'epadmin' && checkUser !== 'epadmin') {
      setChangePassError("The root security account username 'EPADMIN' is system-protected and cannot be changed.");
      return;
    }

    if (checkUser !== oldUsernameLower) {
      // Check if the new username already exists in another account
      const isDuplicate = accounts.some(acc => 
        acc.id !== selectedUser.id && acc.username.toLowerCase() === checkUser
      );
      if (isDuplicate) {
        setChangePassError("An account with this username already exists.");
        return;
      }
    }

    try {
      if (checkUser !== oldUsernameLower) {
        // Create new document with new username key (which is checkUser)
        const newRef = doc(db, 'userAccounts', checkUser);
        await setDoc(newRef, {
          username: updatedUsername.trim(),
          password: checkPass,
          role: targetRole,
          lastActive: selectedUser.lastActive || '',
        });

        // Delete the old document if it wasn't the virtual EPADMIN
        if (selectedUser.id !== 'EPADMIN') {
          const oldRef = doc(db, 'userAccounts', selectedUser.id);
          await deleteDoc(oldRef);
        }

        triggerToast(`Account details for "${updatedUsername}" updated!`);
      } else {
        // Just update existing document
        const docId = selectedUser.id === 'EPADMIN' ? 'epadmin' : selectedUser.id;
        const userRef = doc(db, 'userAccounts', docId);
        await setDoc(userRef, {
          username: selectedUser.id === 'EPADMIN' ? 'EPADMIN' : updatedUsername.trim(),
          password: checkPass,
          role: targetRole,
          lastActive: selectedUser.lastActive || '',
        });

        triggerToast(`Account details updated successfully!`);
      }

      setSelectedUser(null);
      setUpdatedPassword('');
      setUpdatedUsername('');
    } catch (err: any) {
      setChangePassError(`Failed to update account details: ${err.message || err}`);
    }
  };

  // Delete dynamic user account
  const handleDeleteAccount = async (idToDelete: string, usernameToDelete: string) => {
    if (usernameToDelete.toLowerCase() === 'epadmin' || idToDelete.toLowerCase() === 'epadmin') {
      triggerToast("The primary bootstrap security admin account EPADMIN cannot be deleted.");
      return;
    }

    const targetUser = accounts.find(acc => acc.id === idToDelete);
    if (targetUser) {
      setDeleteConfirmUser(targetUser);
    }
  };

  // Format date helper
  const formatLastActive = (isoString?: string) => {
    if (!isoString) return 'Never active';
    try {
      const activeDate = new Date(isoString);
      const diffMs = currentTime.getTime() - activeDate.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      
      if (diffSecs < 40) {
        return 'Active now';
      }
      
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) {
        return `${diffMins}m ago`;
      }
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) {
        return `${diffHours}h ago`;
      }

      return activeDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Offline';
    }
  };

  // Determine online helper (within last 40 seconds)
  const getUserOnlineState = (user: UserAccount): { isOnline: boolean; label: string } => {
    if (!user.lastActive) {
      return { isOnline: false, label: 'Offline' };
    }
    try {
      const activeDate = new Date(user.lastActive);
      const diffSecs = Math.floor((currentTime.getTime() - activeDate.getTime()) / 1000);
      if (diffSecs >= 0 && diffSecs < 40) {
        return { isOnline: true, label: 'Online' };
      }
      return { isOnline: false, label: formatLastActive(user.lastActive) };
    } catch (e) {
      return { isOnline: false, label: 'Offline' };
    }
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUsersCount = accounts.length;
  const onlineUsersCount = accounts.filter(acc => getUserOnlineState(acc).isOnline).length;

  return (
    <div className="min-h-screen bg-slate-50/50 -m-6 p-6 space-y-6 pb-24">
      {/* Delete Confirmation Modal Overlay */}
      <AnimatePresence>
        {deleteConfirmUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isDeleting) setDeleteConfirmUser(null);
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              style={{ zIndex: 49 }}
            />
            
            {/* Modal Body */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 overflow-hidden"
              style={{ zIndex: 50 }}
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-50 rounded-xl text-rose-600 shrink-0">
                  <Trash2 className="w-5 h-5 animate-pulse" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    Confirm Account Purge
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Are you sure you want to permanently delete user login credentials for <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">@{deleteConfirmUser.username}</span>? This action is irreversible.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteConfirmUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    const tempUser = deleteConfirmUser;
                    setIsDeleting(true);
                    try {
                      await deleteDoc(doc(db, 'userAccounts', tempUser.id));
                      triggerToast(`Account credentials for "${tempUser.username}" purged.`);
                      setDeleteConfirmUser(null);
                    } catch (err: any) {
                      triggerToast(`Failed to delete account: ${err.message || err}`);
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-sm shadow-rose-200 cursor-pointer flex items-center gap-1.5"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Permanently Delete</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-4 py-3 rounded-xl shadow-lg text-xs font-bold font-sans"
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-slate-600 shrink-0" />
            <span>User Accounts & Security Command Center</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">Create warehouse auditor logins, update employee passwords, and audit online connection status in real-time.</p>
        </div>
      </header>

      {/* Audit Stats Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs relative overflow-hidden flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Total Registered Accounts</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">{totalUsersCount}</p>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/20 rounded-full translate-x-8 -translate-y-8" />
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs relative overflow-hidden flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <UserCheck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Active Users Online</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">
              {onlineUsersCount} <span className="text-xs font-bold text-slate-400">/ {totalUsersCount}</span>
            </p>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/20 rounded-full translate-x-8 -translate-y-8" />
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs relative overflow-hidden flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">System Authorization</p>
            <p className="text-xs font-black text-indigo-700 tracking-tight mt-1 uppercase bg-indigo-50/50 border border-indigo-100 rounded px-2 py-0.5 inline-block">
              Authoritative Sync: OK
            </p>
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/20 rounded-full translate-x-8 -translate-y-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column - Users List */}
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <span>Auditor Account Roll</span>
              </h3>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">Real-time terminal connection roster</p>
            </div>

            {/* Search Input */}
            <div className="relative max-w-xs w-full">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input 
                type="text" 
                placeholder="Search user or role..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-500 transition-all font-sans"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-xs text-slate-450 font-bold uppercase tracking-wider">Streaming user registry state...</p>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-xs text-slate-400 italic font-bold">No accounts match the current query criteria.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-5">Username</th>
                    <th className="py-3 px-4">Authorized Role</th>
                    <th className="py-3 px-4">Connection Tracker</th>
                    <th className="py-3 px-5 text-right w-36">Administrative Commands</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {filteredAccounts.map((user) => {
                    const state = getUserOnlineState(user);
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/50 transition-all group">
                        {/* Username */}
                        <td className="py-3.5 px-5 font-extrabold text-slate-700">
                          <span className="flex items-center gap-2 font-mono">
                            {user.username}
                          </span>
                        </td>
                        {/* Role tag */}
                        <td className="py-3.5 px-4 font-bold">
                          {user.role === 'super_admin' ? (
                            <span className="text-[9px] font-black tracking-widest text-[#9c27b0] bg-fuchsia-50 border border-fuchsia-100 uppercase rounded-sm px-1.5 py-0.5">
                              Super Admin
                            </span>
                          ) : user.role === 'viewer' ? (
                            <span className="text-[9px] font-black tracking-widest text-amber-700 bg-amber-50 border border-amber-100 uppercase rounded-sm px-1.5 py-0.5">
                              Viewer (Read-Only)
                            </span>
                          ) : (
                            <span className="text-[9px] font-black tracking-widest text-blue-700 bg-blue-50 border border-blue-100 uppercase rounded-sm px-1.5 py-0.5">
                              Warehouse User
                            </span>
                          )}
                        </td>
                        {/* Online / Active status */}
                        <td className="py-3.5 px-4">
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${state.isOnline ? 'bg-emerald-505 bg-emerald-500 animate-pulse outline-2 outline-emerald-200' : 'bg-slate-400'}`} />
                            <span className={`font-semibold ${state.isOnline ? 'text-emerald-700 font-extrabold' : 'text-slate-505 text-slate-500'}`}>
                              {state.label}
                            </span>
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="py-3.5 px-5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(user);
                              setUpdatedUsername(user.username);
                              setUpdatedPassword(user.password || '');
                              setUpdatedRole(user.role);
                              setChangePassError(null);
                            }}
                            className="text-xs font-extrabold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition-all text-[10px] uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Key className="w-3 h-3 text-slate-500" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(user.id, user.username)}
                            disabled={user.username.toLowerCase() === 'epadmin' || user.id.toLowerCase() === 'epadmin'}
                            className="text-xs font-extrabold text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-30 disabled:hover:bg-rose-50 rounded-lg p-1.5 transition-all outline-none cursor-pointer"
                            title="Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Right Columns - Form boxes */}
        <section className="space-y-6">
          {/* Box 1: Add New Account */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>Initialize Auditor Login</span>
              </h4>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">Produce fresh staff and admin credentials</p>
            </div>

            {formError && (
              <div className="mb-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl p-3 flex items-start gap-2.5 font-sans">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-semibold">{formError}</p>
              </div>
            )}

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 block">Username</label>
                <input 
                  type="text" 
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="e.g. auditor_john"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 block">Initial Passcode</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter login password"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500 block">Authorized Role</label>
                <select 
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 bg-white"
                >
                  <option value="user">Auditor User (Standard Staff)</option>
                  <option value="viewer">Viewer (Read-Only Access)</option>
                  <option value="super_admin">Super Administrator (Full System)</option>
                </select>
              </div>

              <button 
                type="submit"
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer active:scale-95"
              >
                Create Account Key
              </button>
            </form>
          </div>

          {/* Box 2: Edit selected user (Conditional rendering) */}
          <AnimatePresence>
            {selectedUser && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5 overflow-hidden"
              >
                <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-emerald-600" />
                    <span>Edit Account Details</span>
                  </h4>
                  <button 
                    onClick={() => setSelectedUser(null)}
                    className="text-[10px] font-extrabold text-slate-400 hover:text-slate-600 uppercase"
                  >
                    Cancel
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-150 p-2.5 rounded-xl mb-4 text-xs flex gap-2">
                  <Shield className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-extrabold block leading-none mb-1 text-slate-700">Modifying Account:</span>
                    <span className="font-mono font-bold text-slate-600">@{selectedUser.username}</span>
                  </div>
                </div>

                {changePassError && (
                  <div className="mb-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl p-3 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-semibold">{changePassError}</p>
                  </div>
                )}

                <form onSubmit={handleUpdateAccountDetails} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 block">Edit Username</label>
                    <input 
                      type="text" 
                      value={updatedUsername}
                      onChange={e => setUpdatedUsername(e.target.value)}
                      disabled={selectedUser.username.toLowerCase() === 'epadmin'}
                      placeholder="Username"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 disabled:opacity-60 disabled:bg-slate-100 font-mono"
                    />
                    {selectedUser.username.toLowerCase() === 'epadmin' && (
                      <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">The bootstrap Admin username is system-protected.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 block">Update Password</label>
                    <input 
                      type="password" 
                      value={updatedPassword}
                      onChange={e => setUpdatedPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 block">Update Authorized Role</label>
                    <select 
                      value={updatedRole}
                      onChange={e => setUpdatedRole(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:bg-white focus:border-blue-500 bg-white"
                    >
                      <option value="user">Auditor User (Standard Staff)</option>
                      <option value="viewer">Viewer (Read-Only Access)</option>
                      <option value="super_admin">Super Administrator (Full System)</option>
                    </select>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    Save Changes
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
