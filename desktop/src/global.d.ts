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
      setZoomFactor?: (scale: number) => Promise<void>;
      onUpdateStatus?: (
        callback: (status: {
          state: "downloading" | "downloaded" | "error";
          percent?: number;
          version?: string;
          message?: string;
        }) => void,
      ) => () => void;
    };
  }
}
