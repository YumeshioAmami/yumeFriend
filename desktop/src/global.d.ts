export {};

declare global {
  interface Window {
    yumeFriend?: {
      version: string;
      openPet?: (friendId?: string) => void;
      closePet?: () => void;
      openMain?: () => void;
      checkUpdate?: (url: string) => Promise<{ version: string | null }>;
      downloadUpdate?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
    };
  }
}
