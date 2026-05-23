import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Settings, Key, User, CheckCircle2, XCircle,
  BarChart3, Users, Trash2, Edit3, Search, RefreshCw,
  Coins, ArrowDownCircle, ArrowUpCircle, Clock, TrendingUp
} from 'lucide-react';
import { Withdrawal } from '../types';

interface AdminUser {
  id: string;
  balance: number;
  tasksCompleted: string[];
  referralsCount: number;
  referrerId: string | null;
  updatedAt: string;
}

interface Stats {
  totalUsers: number;
  pendingWithdrawals: number;
  approvedWithdrawals: number;
  rejectedWithdrawals: number;
  totalBalance: number;
}

type AdminTab = 'dashboard' | 'users' | 'withdrawals' | 'settings';

export default function Admin() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Dashboard
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editBalance, setEditBalance] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Withdrawals
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Settings
  const [exchangeRate, setExchangeRate] = useState(10000);
  const [minWithdraw, setMinWithdraw] = useState(50000);
  const [dollarRate, setDollarRate] = useState(5.0);
  const [savingSettings, setSavingSettings] = useState(false);

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  });

  // --- Fetch functions ---
  const fetchStats = useCallback(async () => {
    if (!token) return;
    setLoadingStats(true);
    try {
      const res = await fetch('/api/admin/stats', { headers: authHeaders() });
      const data = await res.json();
      if (res.status === 401) { handleSessionExpired(); return; }
      if (data.success) setStats(data.stats);
    } catch (err) { console.error(err); }
    finally { setLoadingStats(false); }
  }, [token]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders() });
      const data = await res.json();
      if (res.status === 401) { handleSessionExpired(); return; }
      if (data.success) setUsers(data.users);
    } catch (err) { console.error(err); }
    finally { setLoadingUsers(false); }
  }, [token]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (res.ok && data.success) {
        setExchangeRate(data.settings.exchangeRate || 10000);
        setMinWithdraw(data.settings.minWithdraw || 50000);
        setDollarRate(data.settings.dollarRate || 5.0);
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchWithdrawals = useCallback(async () => {
    if (!token) return;
    setLoadingData(true);
    try {
      const res = await fetch('/api/admin/withdrawals', { headers: authHeaders() });
      const data = await res.json();
      if (res.status === 401) { handleSessionExpired(); return; }
      if (data.success) {
        setWithdrawals(data.withdrawals.sort((a: Withdrawal, b: Withdrawal) => b.timestamp - a.timestamp));
      }
    } catch (err) { console.error(err); }
    finally { setLoadingData(false); }
  }, [token]);

  const handleSessionExpired = () => {
    setToken(null);
    localStorage.removeItem('admin_token');
  };

  useEffect(() => {
    if (token) {
      fetchStats();
      fetchUsers();
      fetchSettings();
      fetchWithdrawals();
    }
  }, [token, fetchStats, fetchUsers, fetchSettings, fetchWithdrawals]);

  // --- Actions ---
  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        localStorage.setItem('admin_token', data.token);
      } else {
        setError(data.error || 'رمز ورود نامعتبر است.');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: authHeaders(),
        });
      } catch (err) {}
    }
    setToken(null);
    localStorage.removeItem('admin_token');
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ settings: { exchangeRate, minWithdraw, dollarRate } })
      });
      const data = await res.json();
      if (data.success) {
        alert("تنظیمات با موفقیت ذخیره شد.");
      } else {
        alert(data.error || "خطا در ذخیره تنظیمات");
      }
    } catch (err) {
      alert("خطا در ارتباط با سرور");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/admin/withdraw/status', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id, status })
      });
      const data = await res.json();
      if (data.success) {
        fetchWithdrawals();
        fetchStats();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("خطا در به روزرسانی");
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const res = await fetch('/api/admin/user/update', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userId: editingUser.id, balance: editBalance })
      });
      const data = await res.json();
      if (data.success) {
        setEditingUser(null);
        fetchUsers();
        fetchStats();
      } else {
        alert(data.error || 'خطا');
      }
    } catch (err) {
      alert("خطا در ارتباط با سرور");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/user/delete', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        setConfirmDelete(null);
        fetchUsers();
        fetchStats();
      } else {
        alert(data.error || 'خطا');
      }
    } catch (err) {
      alert("خطا در ارتباط با سرور");
    }
  };

  // --- Filter helpers ---
  const filteredUsers = users.filter(u =>
    u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWithdrawals = withdrawalFilter === 'all'
    ? withdrawals
    : withdrawals.filter(w => w.status === withdrawalFilter);

  // --- Login Screen ---
  if (!token) {
    return (
      <div className="flex flex-col p-6 items-center justify-center h-full w-full" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>
        <div className="w-full max-w-xs backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 flex flex-col items-center gap-6 shadow-xl">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-2" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 0 40px rgba(239,68,68,0.3)' }}>
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white text-center">پنل مدیریت</h2>
          <p className="text-xs text-white/40 text-center">رمز عبور ادمین را وارد کنید</p>

          <div className="w-full space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <Key className="w-4 h-4 text-white/40" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="رمز عبور..."
                className="w-full bg-black/30 border border-white/10 rounded-xl pr-10 pl-4 py-3 text-white placeholder-white/20 outline-none focus:border-red-500 transition-all font-mono text-left"
                dir="ltr"
              />
            </div>

            {error && <p className="text-red-400 text-xs text-center animate-pulse">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-lg transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', boxShadow: '0 4px 20px rgba(239,68,68,0.3)' }}
            >
              {loading ? 'در حال بررسی...' : 'ورود به پنل'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Stat Card Component ---
  const StatCard = ({ icon: Icon, label, value, color, gradient }: { icon: any; label: string; value: string | number; color: string; gradient: string }) => (
    <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl" style={{ background: gradient }} />
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-xs text-white/50">{label}</span>
      </div>
      <span className="text-2xl font-bold text-white font-mono">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );

  // --- Tab Button ---
  const TabButton = ({ tab, icon: Icon, label }: { tab: AdminTab; icon: any; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
        activeTab === tab
          ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-lg shadow-red-500/10'
          : 'text-white/50 hover:text-white/80 hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 backdrop-blur-md bg-black/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">پنل مدیریت</h2>
            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              آنلاین
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-2 bg-white/10 rounded-lg text-xs text-white hover:bg-red-500/20 hover:text-red-400 transition-all flex items-center gap-2"
        >
          <XCircle className="w-4 h-4" />
          خروج
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-white/5" style={{ scrollbarWidth: 'none' }}>
        <TabButton tab="dashboard" icon={BarChart3} label="داشبورد" />
        <TabButton tab="users" icon={Users} label="کاربران" />
        <TabButton tab="withdrawals" icon={ArrowDownCircle} label="برداشت‌ها" />
        <TabButton tab="settings" icon={Settings} label="تنظیمات" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">

        {/* === DASHBOARD TAB === */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-white/50" />
                نمای کلی
              </h3>
              <button onClick={() => { fetchStats(); fetchUsers(); fetchWithdrawals(); }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                <RefreshCw className={`w-4 h-4 text-white/50 ${loadingStats ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard icon={Users} label="کل کاربران" value={stats.totalUsers} color="#3b82f6" gradient="linear-gradient(90deg, #3b82f6, #8b5cf6)" />
                  <StatCard icon={Coins} label="کل سکه‌ها" value={stats.totalBalance} color="#eab308" gradient="linear-gradient(90deg, #eab308, #f97316)" />
                  <StatCard icon={Clock} label="در انتظار" value={stats.pendingWithdrawals} color="#f59e0b" gradient="linear-gradient(90deg, #f59e0b, #ef4444)" />
                  <StatCard icon={CheckCircle2} label="تایید شده" value={stats.approvedWithdrawals} color="#22c55e" gradient="linear-gradient(90deg, #22c55e, #06b6d4)" />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <StatCard icon={XCircle} label="رد شده" value={stats.rejectedWithdrawals} color="#ef4444" gradient="linear-gradient(90deg, #ef4444, #ec4899)" />
                </div>
              </>
            ) : (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-4 border-white/20 border-t-red-400 rounded-full animate-spin" />
              </div>
            )}

            {/* Recent users */}
            <div className="mt-6">
              <h4 className="text-sm font-bold text-white/70 mb-3">آخرین کاربران</h4>
              <div className="space-y-2">
                {users.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <span className="text-xs text-white/80 font-mono">{u.id.length > 15 ? u.id.substring(0, 15) + '...' : u.id}</span>
                    </div>
                    <span className="text-xs text-yellow-400 font-bold font-mono">{u.balance.toLocaleString()} 🪙</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === USERS TAB === */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-white/50" />
                مدیریت کاربران ({users.length})
              </h3>
              <button onClick={fetchUsers} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                <RefreshCw className={`w-4 h-4 text-white/50 ${loadingUsers ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <Search className="w-4 h-4 text-white/30" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی کاربر با ID..."
                className="w-full bg-black/30 border border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-white text-sm placeholder-white/20 outline-none focus:border-blue-500 transition-all font-mono text-left"
                dir="ltr"
              />
            </div>

            {/* Edit Modal */}
            {editingUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setEditingUser(null)}>
                <div className="w-full max-w-sm bg-[#1a1a3e] border border-white/20 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <h4 className="text-white font-bold text-center">ویرایش کاربر</h4>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <span className="text-[10px] text-white/40">شناسه کاربر</span>
                    <p className="text-sm text-cyan-400 font-mono mt-1 break-all">{editingUser.id}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-white/50">موجودی سکه</label>
                    <input
                      type="number"
                      value={editBalance}
                      onChange={(e) => setEditBalance(parseInt(e.target.value) || 0)}
                      className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-blue-500 font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateUser}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                      style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                    >
                      ذخیره
                    </button>
                    <button
                      onClick={() => setEditingUser(null)}
                      className="flex-1 py-2.5 bg-white/10 rounded-xl text-sm font-bold text-white/70 hover:bg-white/20 transition-all"
                    >
                      لغو
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(null)}>
                <div className="w-full max-w-sm bg-[#1a1a3e] border border-red-500/30 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                      <Trash2 className="w-7 h-7 text-red-400" />
                    </div>
                    <h4 className="text-white font-bold">حذف کاربر</h4>
                    <p className="text-xs text-white/50 text-center">آیا از حذف این کاربر اطمینان دارید؟ این عمل غیرقابل بازگشت است.</p>
                    <p className="text-xs text-cyan-400 font-mono">{confirmDelete}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteUser(confirmDelete)}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-bold text-white transition-all"
                    >
                      بله، حذف شود
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 py-2.5 bg-white/10 rounded-xl text-sm font-bold text-white/70 hover:bg-white/20 transition-all"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* User List */}
            {loadingUsers ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center text-white/40 border border-white/10 border-dashed rounded-xl py-10">
                {searchQuery ? 'کاربری یافت نشد.' : 'هنوز کاربری وجود ندارد.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map(u => (
                  <div key={u.id} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xs text-white font-mono font-bold">{u.id}</p>
                          <p className="text-[10px] text-white/30 mt-0.5">
                            {u.updatedAt ? new Date(u.updatedAt).toLocaleString('fa-IR') : '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-black/20 rounded-lg p-2 text-center">
                        <span className="text-[10px] text-white/40 block">سکه</span>
                        <span className="text-sm text-yellow-400 font-bold font-mono">{u.balance.toLocaleString()}</span>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2 text-center">
                        <span className="text-[10px] text-white/40 block">تسک‌ها</span>
                        <span className="text-sm text-cyan-400 font-bold font-mono">{u.tasksCompleted?.length || 0}</span>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2 text-center">
                        <span className="text-[10px] text-white/40 block">رفرال</span>
                        <span className="text-sm text-purple-400 font-bold font-mono">{u.referralsCount || 0}</span>
                      </div>
                    </div>

                    {u.referrerId && (
                      <div className="text-[10px] text-white/30 bg-black/10 rounded-lg px-2 py-1.5">
                        معرف: <span className="text-white/50 font-mono">{u.referrerId}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingUser(u); setEditBalance(u.balance); }}
                        className="flex-1 py-2 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 rounded-xl text-xs font-bold transition-all border border-blue-500/20 flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> ویرایش
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u.id)}
                        className="flex-1 py-2 bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-xl text-xs font-bold transition-all border border-red-500/20 flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === WITHDRAWALS TAB === */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-bold flex items-center gap-2">
                <ArrowDownCircle className="w-5 h-5 text-white/50" />
                درخواست‌های برداشت
              </h3>
              <button onClick={fetchWithdrawals} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                <RefreshCw className={`w-4 h-4 text-white/50 ${loadingData ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {([
                { key: 'all', label: 'همه', color: 'white' },
                { key: 'pending', label: 'در انتظار', color: '#f59e0b' },
                { key: 'approved', label: 'تایید شده', color: '#22c55e' },
                { key: 'rejected', label: 'رد شده', color: '#ef4444' },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setWithdrawalFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                    withdrawalFilter === f.key
                      ? 'bg-white/15 border border-white/20'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                  style={{ color: withdrawalFilter === f.key ? f.color : 'rgba(255,255,255,0.4)' }}
                >
                  {f.label}
                  {f.key !== 'all' && (
                    <span className="mr-1 opacity-60">
                      ({withdrawals.filter(w => w.status === f.key).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {loadingData ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-4 border-white/20 border-t-red-400 rounded-full animate-spin" />
              </div>
            ) : filteredWithdrawals.length === 0 ? (
              <div className="text-center text-white/40 border border-white/10 border-dashed rounded-xl py-10">
                درخواستی وجود ندارد.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredWithdrawals.map(w => (
                  <div key={w.id} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start border-b border-white/10 pb-3">
                      <div className="flex flex-col">
                        <span className="text-yellow-400 font-bold text-lg">{w.amount.toLocaleString()} سکه</span>
                        <span className="text-xs text-white/40 mt-1">{new Date(w.timestamp).toLocaleString('fa-IR')}</span>
                      </div>
                      <div>
                        {w.status === 'pending' ? (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-[10px] rounded border border-yellow-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> در حال بررسی
                          </span>
                        ) : w.status === 'approved' ? (
                          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] rounded border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> واریز شده
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/30 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> رد شده
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <User className="w-4 h-4" />
                      <span className="font-mono text-[10px]">{w.userId}</span>
                    </div>

                    <div className="flex flex-col gap-1 bg-black/20 p-2 rounded-lg border border-white/5">
                      <span className="text-[10px] text-white/40">آدرس {w.method}</span>
                      <span className="font-mono text-xs text-cyan-400 break-all select-all">{w.address}</span>
                    </div>

                    {w.status === 'pending' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleUpdateStatus(w.id, 'approved')}
                          className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-xl text-xs font-bold transition-all border border-emerald-500/30 flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="w-4 h-4" /> تایید و واریز
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(w.id, 'rejected')}
                          className="flex-1 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-xl text-xs font-bold transition-all border border-red-500/30 flex items-center justify-center gap-1"
                        >
                          <XCircle className="w-4 h-4" /> رد کردن
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === SETTINGS TAB === */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-5 h-5 text-white/50" />
                <h3 className="text-white font-bold">تنظیمات کیف پول</h3>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-white/50">نرخ تبدیل سکه به TON (هر چند سکه = 1 TON)</label>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(parseInt(e.target.value) || 10000)}
                  className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-red-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-white/50">ارزش هر TON به دلار ($)</label>
                <input
                  type="number"
                  step="0.1"
                  value={dollarRate}
                  onChange={e => setDollarRate(parseFloat(e.target.value) || 5.0)}
                  className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-red-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-white/50">حداقل سکه برای برداشت</label>
                <input
                  type="number"
                  value={minWithdraw}
                  onChange={e => setMinWithdraw(parseInt(e.target.value) || 50000)}
                  className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-red-500 font-mono"
                  dir="ltr"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all mt-2"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' }}
              >
                {savingSettings ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
              </button>
            </div>

            {/* Admin Password Info */}
            <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-5 h-5 text-white/50" />
                <h3 className="text-white font-bold">اطلاعات امنیتی</h3>
              </div>
              <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-white/40 leading-6">
                  رمز عبور ادمین از طریق متغیر محیطی <span className="font-mono text-cyan-400">ADMIN_PASSWORD</span> در فایل
                  <span className="font-mono text-cyan-400"> .env</span> تنظیم می‌شود.
                  نشست ادمین پس از ۱۵ دقیقه عدم فعالیت منقضی می‌شود.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
