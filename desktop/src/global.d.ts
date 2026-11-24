export {};

declare global {
  interface Window {
    yumeFriend?: {
      version: string;
      openPet?: (friendId?: string) => void;
      closePet?: () => void;
      openMain?: () => void;
      getPetScale?: () => Promise<number>;
      setPetIgnoreMouse?: (ignore: boolean) => Promise<boolean>;
      setPetScale?: (scale: number) => Promise<number>;
      isPetOpen?: () => Promise<boolean>;
      isMainFocused?: () => Promise<boolean>;
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
