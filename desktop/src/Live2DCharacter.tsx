import { useEffect, useRef, useState } from "react";
import { Application, Ticker } from "pixi.js";
import {
  API_BASE,
  getLive2DRuntimeStatus,
  getLive2DSettings,
  type Live2DExpression,
  type Live2DSettings,
} from "./api";

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

let runtimePromise: Promise<typeof import("pixi-live2d-display/cubism4")> | null = null;

export function resetLive2DRuntime(): void {
  runtimePromise = null;
}

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      if (!window.Live2DCubismCore) {
        const status = await getLive2DRuntimeStatus();
        if (!status.available) {
          throw new Error("需要先在设置里下载 Live2D 运行时");
        }
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${API_BASE}/live2d/runtime/core.js?v=${Date.now()}`;
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
  modelId,
  mood,
  settingsOverride,
  expressionDefs,
  onCoreReady,
  speaking = false,
  className = "",
}: {
  modelUrl: string;
  modelId?: string | null;
  mood?: string | null;
  settingsOverride?: Live2DSettings | null;
  expressionDefs?: Live2DExpression[] | null;
  onCoreReady?: (core: any) => void;
  speaking?: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const speakingRef = useRef(speaking);
  const moodRef = useRef(mood);
  const modelRef = useRef<any>(null);
  const settingsRef = useRef<Live2DSettings | null>(null);
  const expressionsRef = useRef<Live2DExpression[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [runtimeEpoch, setRuntimeEpoch] = useState(0);

  const applyMood = () => {
    const core = modelRef.current?.internalModel?.coreModel;
    const settings = settingsRef.current;
    if (!core || !settings) return;
    const label =
      settings.labels.find((item) => item.name === moodRef.current) ??
      settings.labels.find((item) => item.name === settings.default_label) ??
      settings.labels[0];
    const params: Record<string, number> = { ...settings.base };
    Object.assign(params, label?.params);
    for (const name of label?.expressions ?? []) {
      const definition = expressionsRef.current.find((item) => item.name === name);
      for (const op of definition?.params ?? []) {
        const blend = op.blend.toLowerCase();
        if (blend === "multiply") {
          params[op.id] = (params[op.id] ?? 1) * op.value;
        } else if (blend === "overwrite") {
          params[op.id] = op.value;
        } else {
          params[op.id] = (params[op.id] ?? 0) + op.value;
        }
      }
    }
    for (const [id, value] of Object.entries(params)) {
      core.setParameterValueById(id, value);
    }
    if (speakingRef.current) {
      core.setParameterValueById(
        "ParamMouthOpenY",
        0.15 + Math.max(0, Math.sin(performance.now() / 90)) * 0.45,
      );
    }
  };

  useEffect(() => {
    const onRuntimeChanged = () => {
      resetLive2DRuntime();
      setRuntimeEpoch((value) => value + 1);
    };
    window.addEventListener("yf-live2d-runtime-changed", onRuntimeChanged);
    return () => window.removeEventListener("yf-live2d-runtime-changed", onRuntimeChanged);
  }, []);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    moodRef.current = mood;
    applyMood();
  }, [mood]);

  useEffect(() => {
    if (!settingsOverride) return;
    settingsRef.current = settingsOverride;
    applyMood();
  }, [settingsOverride]);

  useEffect(() => {
    if (!expressionDefs) return;
    expressionsRef.current = expressionDefs;
    applyMood();
  }, [expressionDefs]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let app: Application | null = null;
    let model: any = null;
    let disposed = false;
    const onAfterMotion = () => applyMood();

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
        const view = app.view as HTMLCanvasElement;
        view.style.width = "100%";
        view.style.height = "100%";
        view.style.display = "block";
        host.appendChild(view);

        model = await Live2DModel.from(modelUrl, { autoInteract: false });
        if (disposed) {
          model.destroy();
          app.destroy(true);
          return;
        }
        app.stage.addChild(model);
        modelRef.current = model;
        model.anchor.set(0, 0);
        model.internalModel?.on("afterMotionUpdate", onAfterMotion);
        onCoreReady?.(model.internalModel?.coreModel);

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
        if (modelId && !settingsOverride) {
          const data = await getLive2DSettings(modelId);
          settingsRef.current = data.settings;
          expressionsRef.current = data.expressions;
          applyMood();
        }

        setLoading(false);
        setErrorText("");
      } catch (error) {
        console.error("[live2d]", error);
        if (!disposed) {
          setLoading(false);
          setFailed(true);
          setErrorText(error instanceof Error ? error.message : "Live2D 加载失败");
        }
      }
    };
    void boot();

    return () => {
      disposed = true;
      modelRef.current = null;
      settingsRef.current = null;
      expressionsRef.current = [];
      onCoreReady?.(null);
      (host as any).__observer?.disconnect();
      try {
        model?.internalModel?.off("afterMotionUpdate", onAfterMotion);
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
  }, [modelUrl, runtimeEpoch]);

  return (
    <div ref={hostRef} className={`relative h-full w-full ${className}`}>
      {(loading || failed) && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/45">
          {failed ? "Live2D 加载失败" : "正在加载 Live2D…"}
          {failed && errorText ? `：${errorText}` : ""}
        </div>
      )}
    </div>
  );
}
