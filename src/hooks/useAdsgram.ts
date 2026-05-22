import { useCallback, useEffect, useRef } from 'react';

interface UseAdsgramParams {
  blockId: string;
  onReward: () => void;
  onError?: (result: unknown) => void;
}

/**
 * Hook رسمی Adsgram برای Reward/Interstitial block
 * منبع: https://docs.adsgram.ai/publisher/reward-interstitial-code-examples
 */
export function useAdsgram({ blockId, onReward, onError }: UseAdsgramParams) {
  const AdControllerRef = useRef<ReturnType<typeof window.Adsgram.init> | undefined>(undefined);

  useEffect(() => {
    // init یک بار برای هر blockId کافی است
    AdControllerRef.current = window.Adsgram?.init({ block: blockId });
  }, [blockId]);

  return useCallback(async () => {
    if (AdControllerRef.current) {
      AdControllerRef.current
        .show()
        .then(() => {
          // کاربر تبلیغ را تا انتها دید
          onReward();
        })
        .catch((result: unknown) => {
          // خطا یا لغو توسط کاربر
          onError?.(result);
        });
    } else {
      onError?.({
        error: true,
        done: false,
        state: 'load',
        description: 'Adsgram script not loaded',
      });
    }
  }, [onError, onReward]);
}
