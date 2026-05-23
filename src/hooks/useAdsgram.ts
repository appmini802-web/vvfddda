import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAdsgramParams {
  blockId: string;
  onReward: () => void;
  onError?: (result: unknown) => void;
}

/**
 * Hook رسمی Adsgram برای Reward/Interstitial block
 * منبع: https://docs.adsgram.ai/publisher/reward-interstitial-code-examples
 *
 * مشکل رایج: اسکریپت sad.min.js ممکن است هنگام mount کامپوننت هنوز لود نشده باشد.
 * راه‌حل: بررسی window.Adsgram هنگام فراخوانی show() نه هنگام init
 */
export function useAdsgram({ blockId, onReward, onError }: UseAdsgramParams) {
  const AdControllerRef = useRef<ReturnType<NonNullable<typeof window.Adsgram>['init']> | undefined>(undefined);

  useEffect(() => {
    // بررسی می‌کنیم اسکریپت Adsgram لود شده یا نه
    const checkAndInit = () => {
      if (window.Adsgram) {
        AdControllerRef.current = window.Adsgram.init({ block: blockId });
        return true;
      }
      return false;
    };

    // اگر قبلاً لود شده
    if (checkAndInit()) return;

    // صبر می‌کنیم تا اسکریپت لود بشه (حداکثر ۵ ثانیه)
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (checkAndInit() || attempts >= 50) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [blockId]);

  return useCallback(async () => {
    // اگر هنوز init نشده، دوباره تلاش کن
    if (!AdControllerRef.current && window.Adsgram) {
      AdControllerRef.current = window.Adsgram.init({ block: blockId });
    }

    if (AdControllerRef.current) {
      AdControllerRef.current
        .show()
        .then(() => {
          onReward();
        })
        .catch((result: unknown) => {
          onError?.(result);
        });
    } else {
      // تشخیص محیط
      const isInTelegram = !!(window.Telegram?.WebApp?.initData);
      onError?.({
        error: true,
        done: false,
        state: 'load',
        description: isInTelegram
          ? 'Adsgram script not loaded yet. Please try again.'
          : 'Adsgram only works inside Telegram Mini App.',
      });
    }
  }, [blockId, onError, onReward]);
}
