import { useEffect, useRef, useState } from "react";
import { Application, Ticker } from "pixi.js";

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

let runtimePromise: Promise<typeof import("pixi-live2d-display/cubism4")> | null = null;

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      if (!window.Live2DCubismCore) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${import.meta.env.BASE_URL}live2dcubismcore.min.js`;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Live2D Core 加载失败"));
          document.head.appendChild(script);
        });
      }
      const module = await import("pixi-live2d-display/cubism4");
      Ticker.shared.maxFPS = 0;
      module.Live2DModel.registerTicker(Ticker);
      return module;
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

export function Live2DCharacter({
  modelUrl,
  speaking = false,
  className = "",
}: {
  modelUrl: string;
  speaking?: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const speakingRef = useRef(speaking);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let app: Application | null = null;
    let model: any = null;
    let disposed = false;
    let ticker: (() => void) | null = null;

    const boot = async () => {
      try {
        const { Live2DModel } = await loadRuntime();
        if (disposed) return;
        app = new Application({
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(2.5, Math.max(2, window.devicePixelRatio || 1)),
          sharedTicker: true,
        });
        app.view.style.width = "100%";
        app.view.style.height = "100%";
        app.view.style.display = "block";
        host.appendChild(app.view as HTMLCanvasElement);

        model = await Live2DModel.from(modelUrl, { autoInteract: false });
        if (disposed) {
          model.destroy();
          app.destroy(true);
          return;
        }
        app.stage.addChild(model);
        model.anchor.set(0, 0);

        const fit = () => {
          if (!app || !model || disposed) return;
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          app.renderer.resize(width, height);
          const originalWidth = Number(model.internalModel?.originalWidth) || 1;
          const originalHeight = Number(model.internalModel?.originalHeight) || 1;
          const scale = Math.min(width / originalWidth, height / originalHeight) * 0.98;
          model.scale.set(scale);
          model.position.set(
            (width - originalWidth * scale) / 2,
            height - originalHeight * scale,
          );
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(host);
        host.dataset.observer = "1";
        (host as any).__observer = observer;
        void model.motion("Idle").catch(() => undefined);

        ticker = () => {
          const core = model?.internalModel?.coreModel;
          if (!core) return;
          const mouth = speakingRef.current
            ? 0.15 + Math.max(0, Math.sin(performance.now() / 90)) * 0.45
            : 0;
          try {
            core.setParameterValueById("ParamMouthOpenY", mouth);
          } catch {
            // model has no mouth parameter
          }
        };
        app.ticker.add(ticker);
        setLoading(false);
      } catch (error) {
        console.error("[live2d]", error);
        if (!disposed) {
          setLoading(false);
          setFailed(true);
        }
      }
    };
    void boot();

    return () => {
      disposed = true;
      (host as any).__observer?.disconnect();
      if (app && ticker) app.ticker.remove(ticker);
      try {
        model?.destroy();
      } catch {
        // ignore
      }
      try {
        app?.destroy(true, { children: true });
      } catch {
        // ignore
      }
    };
  }, [modelUrl]);

  return (
    <div ref={hostRef} className={`relative h-full w-full ${className}`}>
      {(loading || failed) && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/45">
          {failed ? "Live2D 加载失败" : "正在加载 Live2D…"}
        </div>
      )}
    </div>
  );
}
