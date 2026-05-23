import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Play, AlertCircle, TrendingUp, Clock } from 'lucide-react';
import { UserData } from '../types';
import { useAdsgram } from '../hooks/useAdsgram';

interface HomeProps {
  userId: string;
  userData: UserData | null;
  onReward: (amount: number) => void;
}

const MAX_DAILY_ADS = 20;
const AD_REWARD_AMOUNT = 50; // باید با مقدار REWARDS.AD_WATCH در server.ts یکسان باشد

function getTodayKey(userId: string) {
  return `adsWatched_${new Date().toISOString().slice(0, 10)}_${userId}`;
}

function getCooldownKey(userId: string) {
  return `adsCooldown_${userId}`;
}

function readAdsWatched(userId: string): number {
  try {
    return parseInt(localStorage.getItem(getTodayKey(userId)) || '0', 10);
  } catch {
    return 0;
  }
}

function readCooldown(userId: string): number {
  try {
    const raw = localStorage.getItem(getCooldownKey(userId));
    if (!raw) return 0;
    const { until } = JSON.parse(raw);
    const remaining = Math.ceil((until - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

export default function Home({ userId, userData, onReward }: HomeProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adsWatched, setAdsWatched] = useState<number>(() => readAdsWatched(userId));
  const [cooldown, setCooldown] = useState<number>(() => readCooldown(userId));

  const rewardBlockId = import.meta.env.VITE_ADSGRAM_BLOCK_ID;
  const isSetup = rewardBlockId && rewardBlockId !== '' && rewardBlockId !== 'xxxx-xxxx-xxxx-xxxx';
  const isInTelegram = !!(window.Telegram?.WebApp?.initData);

  // تایمر cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ─── callback های Adsgram ────────────────────────────────────────────────
  const onAdsgramReward = useCallback(async () => {
    // کاربر تبلیغ را تا انتها دید — پاداش از سرور بگیر
    try {
      const response = await fetch('/api/reward/ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (data.success) {
        onReward(AD_REWARD_AMOUNT);
        setAdsWatched(prev => {
          const next = prev + 1;
          try { localStorage.setItem(getTodayKey(userId), String(next)); } catch {}
          return next;
        });
        const cooldownSec = 30;
        setCooldown(cooldownSec);
        try {
          localStorage.setItem(getCooldownKey(userId), JSON.stringify({ until: Date.now() + cooldownSec * 1000 }));
        } catch {}
      } else {
        setError(data.error || 'خطا در ثبت پاداش');
      }
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setIsPlaying(false);
    }
  }, [userId, onReward]);

  const onAdsgramError = useCallback((result: unknown) => {
    console.error('Adsgram error:', result);
    const r = result as any;
    // خطاهای رایج Adsgram
    if (r?.description?.includes('Telegram')) {
      setError('تبلیغات فقط داخل تلگرام نمایش داده می‌شود.');
    } else if (r?.state === 'load') {
      setError('اسکریپت تبلیغات لود نشده. لطفاً صفحه را رفرش کنید.');
    } else {
      setError('تبلیغ لغو شد یا خطایی رخ داد.');
    }
    setIsPlaying(false);
  }, []);

  // ─── hook رسمی Adsgram ───────────────────────────────────────────────────
  const showAd = useAdsgram({
    blockId: isSetup ? rewardBlockId : 'test-block-id',
    onReward: onAdsgramReward,
    onError: onAdsgramError,
  });

  const handleWatchAd = async () => {
    if (isPlaying || cooldown > 0) return;
    if (adsWatched >= MAX_DAILY_ADS) {
      setError('سقف تماشای روزانه تکمیل شده است. فردا دوباره امتحان کنید.');
      return;
    }
    setError(null);
    setIsPlaying(true);

    if (!isSetup) {
      // حالت آزمایشی بدون Block ID
      setTimeout(async () => {
        await onAdsgramReward();
      }, 1500);
      return;
    }

    // نمایش تبلیغ واقعی از طریق hook رسمی
    await showAd();
  };

  return (
    <div className="flex flex-col p-6 space-y-6 h-full w-full items-center">

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm flex flex-col gap-5 pb-8"
      >
        {/* کارت موجودی */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center mt-4 shadow-xl">
          <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2">
            {(userData?.balance ?? 0).toLocaleString('fa-IR')}
          </div>
          <p className="text-[11px] text-white/40 uppercase tracking-widest mt-1 font-bold">موجودی سکه</p>
        </div>

        {/* آمار تماشا */}
        <div className="flex gap-4">
          <div className="flex-1 backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] text-white/60 font-bold">بازدید امروز</span>
            </div>
            <div className="text-xl font-bold text-white">
              {adsWatched} / {MAX_DAILY_ADS}
            </div>
            <div className="w-full bg-white/10 h-1.5 mt-3 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all"
                style={{ width: `${(adsWatched / MAX_DAILY_ADS) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex-[0.7] backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-center items-center">
            <span className="text-[10px] text-white/60 font-bold mb-1">پاداش هر بازدید</span>
            <div className="text-xl font-bold text-yellow-400 flex items-center gap-1">
              <span className="text-xs">+</span>{AD_REWARD_AMOUNT.toLocaleString('fa-IR')}
            </div>
          </div>
        </div>

        {/* کارت تبلیغات Reward */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden">
          {!isSetup && (
            <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl z-10">
              حالت آزمایشی
            </div>
          )}
          {isSetup && !isInTelegram && (
            <div className="absolute top-0 right-0 bg-blue-500 text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl z-10">
              فقط در تلگرام
            </div>
          )}
          <div className="mb-6 mt-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">تبلیغات ویدیویی</h3>
              <span className={`px-2 py-1 text-[10px] rounded border ${
                cooldown > 0
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-green-500/20 text-green-400 border-green-500/30'
              }`}>
                {cooldown > 0 ? `${cooldown} ثانیه` : 'آماده'}
              </span>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              با تماشای هر ویدیو تبلیغاتی، بلافاصله{' '}
              <span className="font-bold text-yellow-400">{AD_REWARD_AMOUNT} سکه</span>{' '}
              به کیف پول شما اضافه می‌شود.
            </p>
          </div>

          <button
            onClick={handleWatchAd}
            disabled={isPlaying || cooldown > 0 || adsWatched >= MAX_DAILY_ADS}
            className={`w-full py-4 rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-all text-white flex items-center justify-center gap-2
              ${(isPlaying || cooldown > 0 || adsWatched >= MAX_DAILY_ADS)
                ? 'bg-white/5 border border-white/10 text-white/40 shadow-none cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-cyan-500/20 hover:scale-[1.02]'}
            `}
          >
            {isPlaying ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : cooldown > 0 ? (
              <Clock className="w-5 h-5 text-white/40" />
            ) : (
              <Play className="w-5 h-5 fill-white" />
            )}
            <span>
              {isPlaying ? 'در حال بارگذاری...'
                : cooldown > 0 ? `${cooldown} ثانیه صبر کنید`
                : adsWatched >= MAX_DAILY_ADS ? 'سقف روزانه تکمیل شد'
                : 'تماشای ویدیو و کسب سکه'}
            </span>
          </button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-red-400 text-xs justify-center bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center leading-relaxed"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </motion.div>

    </div>
  );
}
