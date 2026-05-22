/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { Home as HomeIcon, CheckSquare, Users, Wallet as WalletIcon } from 'lucide-react';
import Home from './views/Home';
import Tasks from './views/Tasks';
import Friends from './views/Friends';
import Wallet from './views/Wallet';
import Admin from './views/Admin';
import { UserData, TabType } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [userId, setUserId] = useState<string | null>(null); // null تا زمانی که ID واقعی بیاد
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const fetchedRef = useRef<string | null>(null); // جلوگیری از fetch تکراری

  useEffect(() => {
    // بررسی #admin در URL
    if (window.location.hash === '#admin') {
      setIsAdminView(true);
    }
    const hashChange = () => {
      setIsAdminView(window.location.hash === '#admin');
    };
    window.addEventListener('hashchange', hashChange);
    return () => window.removeEventListener('hashchange', hashChange);
  }, []);

  useEffect(() => {
    // گرفتن ID کاربر از تلگرام
    const tgUser = WebApp.initDataUnsafe?.user;
    if (tgUser?.id) {
      WebApp.expand();
      WebApp.ready();
      setUserId(tgUser.id.toString());
    } else {
      // حالت تست در مرورگر
      setUserId('debug_user_123');
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    // جلوگیری از fetch تکراری برای همان userId
    if (fetchedRef.current === userId) return;
    fetchedRef.current = userId;

    const fetchUserData = async () => {
      setLoadingUser(true);
      try {
        let referrerId: string | null = null;
        try {
          const startParam = WebApp.initDataUnsafe?.start_param;
          if (startParam && startParam !== userId) {
            referrerId = startParam;
          }
        } catch {}

        const response = await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userId, referrerId })
        });
        const data = await response.json();
        if (response.ok && data) {
          setUserData({
            balance: data.balance ?? 0,
            tasksCompleted: data.tasksCompleted ?? [],
            referralsCount: data.referralsCount ?? 0,
          });
        } else {
          console.error('خطای API:', data.error);
          setUserData({ balance: 0, tasksCompleted: [], referralsCount: 0 });
        }
      } catch (err) {
        console.error('خطا در دریافت اطلاعات کاربر:', err);
        setUserData({ balance: 0, tasksCompleted: [], referralsCount: 0 });
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUserData();
  }, [userId]);

  const handleReward = (amount: number, taskId?: string) => {
    setUserData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        balance: prev.balance + amount,
        tasksCompleted: taskId ? [...prev.tasksCompleted, taskId] : prev.tasksCompleted
      };
    });
  };

  const handleBalanceChange = (newBalance: number) => {
    setUserData(prev => {
      if (!prev) return prev;
      return { ...prev, balance: newBalance };
    });
  };

  if (isAdminView) {
    return (
      <div className="flex flex-col h-screen w-full text-white bg-black/90 overflow-hidden sm:max-w-md sm:mx-auto sm:border-x sm:border-white/10 select-none shadow-2xl" dir="rtl">
        <Admin />
      </div>
    );
  }

  // صفحه لودینگ تا زمانی که userId و userData آماده بشن
  if (!userId || loadingUser) {
    return (
      <div
        className="flex flex-col h-screen w-full items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-400 to-purple-600 p-[3px]">
            <div className="w-full h-full rounded-full bg-[#1a1a2e] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          </div>
          <p className="text-white/50 text-sm">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  const tgUser = WebApp.initDataUnsafe?.user;
  const displayName = tgUser?.first_name || 'کاربر';

  return (
    <div
      className="flex flex-col h-screen w-full text-white overflow-hidden sm:max-w-md sm:mx-auto sm:border-x sm:border-white/10 select-none shadow-2xl"
      dir="rtl"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
    >

      {/* هدر */}
      <header className="px-6 py-5 flex items-center justify-between backdrop-blur-md bg-white/5 border-b border-white/10 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-400 to-purple-600 p-[2px]">
            <div className="w-full h-full rounded-full bg-[#1a1a2e] flex items-center justify-center text-xs font-bold text-white">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">{displayName}</h1>
            <p className="text-[10px] text-cyan-400 font-mono flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              آنلاین
            </p>
          </div>
        </div>
        {/* موجودی در هدر */}
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
          <span className="text-yellow-400 text-sm font-black">{(userData?.balance ?? 0).toLocaleString('fa-IR')}</span>
          <span className="text-white/40 text-[10px]">سکه</span>
        </div>
      </header>

      {/* محتوای اصلی */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {activeTab === 'home' && (
          <Home userId={userId} userData={userData} onReward={handleReward} />
        )}
        {activeTab === 'tasks' && (
          <Tasks userId={userId} userData={userData} onReward={handleReward} />
        )}
        {activeTab === 'friends' && (
          <Friends userId={userId} userData={userData} />
        )}
        {activeTab === 'wallet' && (
          <Wallet userId={userId} userData={userData} onBalanceChange={handleBalanceChange} />
        )}
      </main>

      {/* نوار پایین */}
      <nav className="h-20 backdrop-blur-2xl bg-black/40 border-t border-white/10 px-6 py-2 pb-safe">
        <div className="flex justify-around items-center h-full">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-cyan-400' : 'text-white/50'}`}
          >
            <HomeIcon className="w-6 h-6" />
            <span className={`text-[10px] ${activeTab === 'home' ? 'font-bold' : ''}`}>خانه</span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'tasks' ? 'text-cyan-400' : 'text-white/50'}`}
          >
            <CheckSquare className="w-6 h-6" />
            <span className={`text-[10px] ${activeTab === 'tasks' ? 'font-bold' : ''}`}>وظایف</span>
          </button>

          <button
            onClick={() => setActiveTab('wallet')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'wallet' ? 'text-cyan-400' : 'text-white/50'}`}
          >
            <WalletIcon className="w-6 h-6" />
            <span className={`text-[10px] ${activeTab === 'wallet' ? 'font-bold' : ''}`}>کیف پول</span>
          </button>

          <button
            onClick={() => setActiveTab('friends')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'friends' ? 'text-cyan-400' : 'text-white/50'}`}
          >
            <Users className="w-6 h-6" />
            <span className={`text-[10px] ${activeTab === 'friends' ? 'font-bold' : ''}`}>دوستان</span>
          </button>
        </div>
      </nav>

    </div>
  );
}
