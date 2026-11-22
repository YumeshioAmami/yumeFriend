import { APP_VERSION } from "./version";

export default function App() {
  return (
    <main className="min-h-screen bg-stone-50 p-8 text-stone-900">
      <h1 className="text-xl font-medium">yumeFriend</h1>
      <p className="mt-1 text-sm text-stone-600">桌面端工程底座 {APP_VERSION}</p>
    </main>
  );
}
