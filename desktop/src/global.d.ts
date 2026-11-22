export {};

declare global {
  interface Window {
    yumeFriend?: {
      version: string;
      openPet?: () => void;
      closePet?: () => void;
    };
  }
}
