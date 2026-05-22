import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Copy, Send, Gift } from 'lucide-react';
import { UserData } from '../types';

interface FriendsProps {
  userId: string;
  userData: UserData | null;
}

export default function Friends({ userId, userData }: FriendsProps) {
  const [copied, setCopied] = useState(false);

  // لینک دعوت با startapp برای تلگرام
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'your_bot';
  const referralLink = `https://t.me/${botUsername}?startapp=${userId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert('لینک دعوت کپی شد!');
      }
    } catch {
      // fallback برای مرورگرهایی که clipboard ندارند
      const el = document.createElement('textarea');
      el.value = referralLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = () => {
    const text = `🎁 به من بپیوندید و ${(1000).toLocaleString('fa-IR')} سکه رایگان دریافت کنید!\n\n👇 لینک اختصاصی من:`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`;
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  const referralsCount = userData?.referralsCount ?? 0;
  const earnedFromReferrals = referralsCount * 200; // هماهنگ با REWARDS.REFERRAL_SIGNUP در server.ts

  return (
    <div className="flex flex-col h-full w-full p-6 space-y-5 items-center">

      {/* آیکون و توضیح */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center space-y-3 mt-4"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500/20 to-purple-600/20 flex items-center justify-center border border-white/10 backdrop-blur-md">
          <Users className="w-10 h-10 text-cyan-400" />
        </div>
        <h2 className="text-xl font-bold text-white">دعوت از دوستان</h2>
        <p className="text-white/50 text-sm max-w-xs leading-relaxed">
          برای هر دوستی که با لینک شما وارد شود،{' '}
          <span className="text-yellow-400 font-bold">۲۰۰ سکه</span>{' '}
          پاداش می‌گیرید. همچنین <span className="text-cyan-400 font-bold">۱۰٪</span> از هر درآمد دوستتان هم به شما می‌رسد.
        </p>
      </motion.div>

      <div className="w-full max-w-sm flex flex-col gap-4">

        {/* آمار */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-1">
            <Users className="w-5 h-5 text-purple-400 mb-1" />
            <span className="text-2xl font-black text-white">{referralsCount.toLocaleString('fa-IR')}</span>
            <span className="text-[10px] text-white/40">دوست دعوت شده</span>
          </div>
          <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-1">
            <Gift className="w-5 h-5 text-yellow-400 mb-1" />
            <span className="text-2xl font-black text-yellow-400">{earnedFromReferrals.toLocaleString('fa-IR')}</span>
            <span className="text-[10px] text-white/40">سکه از دعوت‌ها</span>
          </div>
        </motion.div>

        {/* کارت لینک دعوت */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col gap-4 shadow-xl"
        >
          <h3 className="text-sm font-bold text-white">لینک اختصاصی دعوت شما</h3>

          {/* نمایش لینک */}
          <div
            className="bg-black/30 p-3 rounded-xl border border-white/5 text-[11px] font-mono break-all text-white/60 cursor-pointer active:bg-white/5 transition-all"
            dir="ltr"
            onClick={handleCopy}
          >
            {referralLink}
          </div>

          {/* دکمه‌ها */}
          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                copied
                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                  : 'border border-purple-500/40 text-white hover:bg-purple-500/20'
              }`}
            >
              <Copy className="w-4 h-4" />
              {copied ? 'کپی شد!' : 'کپی لینک'}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              ارسال دعوت
            </button>
          </div>
        </motion.div>

        {/* راهنما */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
        >
          <h4 className="text-xs font-bold text-white/70">چطور کار می‌کند؟</h4>
          {[
            { step: '۱', text: 'لینک اختصاصی خود را کپی کنید' },
            { step: '۲', text: 'برای دوستانتان ارسال کنید' },
            { step: '۳', text: 'وقتی دوستتان وارد شد، ۲۰۰ سکه می‌گیرید + ۱۰٪ از درآمدش' },
          ].map(item => (
            <div key={item.step} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {item.step}
              </div>
              <span className="text-xs text-white/50">{item.text}</span>
            </div>
          ))}
        </motion.div>

      </div>
    </div>
  );
}
