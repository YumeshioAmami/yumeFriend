export {};

declare global {
  interface Window {
    yumeFriend?: {
      version: string;
      openPet?: () => void;
      closePet?: () => void;
      checkUpdate?: (url: string) => Promise<{ version: string | null }>;
      downloadUpdate?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
    };
  }
}
