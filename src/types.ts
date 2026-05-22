export interface UserData {
  balance: number;
  tasksCompleted: string[];
  referralsCount?: number;
}

export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  address: string;
  method: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: number;
}

export type TabType = 'home' | 'tasks' | 'friends' | 'wallet';

// Global declaration for Adsgram
declare global {
  interface Window {
    Adsgram?: {
      init: (params: { block: string }) => {
        show: () => Promise<void>;
      };
    };
    Telegram?: {
      WebApp: any;
    };
  }
}
