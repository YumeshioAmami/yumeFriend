import { useEffect, useMemo, useRef, useState } from "react";
import {
  getLive2DSettings,
  listLive2DModels,
  saveLive2DSettings,
  type Live2DModel,
  type Live2DParameter,
  type Live2DSettings,
  type Live2DSettingsResponse,
} from "./api";
import { Live2DCharacter } from "./Live2DCharacter";

const BASIC_PARAMS = [
  "ParamEyeLOpen",
  "ParamEyeROpen",
  "ParamEyeLSmile",
  "ParamEyeRSmile",
  "ParamMouthForm",
  "ParamMouthOpenY",
  "ParamCheek",
  "ParamBrowLY",
  "ParamBrowRY",
  "ParamAngleX",
  "ParamAngleY",
  "ParamAngleZ",
  "ParamBodyAngleX",
];

function cloneSettings(settings: Live2DSettings): Live2DSettings {
  return JSON.parse(JSON.stringify(settings)) as Live2DSettings;
}

function ParamSlider({
  parameter,
  value,
  onChange,
}: {
  parameter: Live2DParameter;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] text-[var(--muted)]">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{parameter.name || parameter.id}</span>
        <span>{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        className="mt-1 w-full"
        min={parameter.min}
        max={parameter.max}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function Live2DSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [models, setModels] = useState<Live2DModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [meta, setMeta] = useState<Live2DSettingsResponse | null>(null);
  const [draft, setDraft] = useState<Live2DSettings | null>(null);
  const [labelIndex, setLabelIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [status, setStatus] = useState("");
  const coreRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    void listLive2DModels().then((result) => {
      setModels(result.items);
      if (!modelId && result.items[0]) setModelId(result.items[0].id);
    });
  }, [open, modelId]);

  useEffect(() => {
    if (!open || !modelId) return;
    setStatus("加载中…");
    void getLive2DSettings(modelId)
      .then((result) => {
        setMeta(result);
        const next = cloneSettings(result.settings);
        setDraft(next);
        const index = next.labels.findIndex((label) => label.name === next.default_label);
        setLabelIndex(index >= 0 ? index : 0);
        setStatus("");
      })
      .catch((error) => setStatus(String(error)));
  }, [open, modelId]);

  const label = draft?.labels[labelIndex];

  const basicParameters = useMemo(() => {
    if (!meta) return [];
    return meta.parameters.filter((parameter) => BASIC_PARAMS.includes(parameter.id));
  }, [meta]);

  const advancedParameters = useMemo(() => {
    if (!meta) return [];
    const query = search.trim().toLowerCase();
    return meta.parameters.filter(
      (parameter) =>
        !BASIC_PARAMS.includes(parameter.id) &&
        (!query ||
          parameter.id.toLowerCase().includes(query) ||
          parameter.name.toLowerCase().includes(query)),
    );
  }, [meta, search]);

  if (!open) return null;

  const updateLabel = (
    index: number,
    update: (current: Live2DSettings["labels"][number]) => Live2DSettings["labels"][number],
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const labels = [...current.labels];
      labels[index] = update({ ...labels[index] });
      return { ...current, labels };
    });
  };

  const parameterValue = (parameter: Live2DParameter) =>
    label?.params[parameter.id] ?? draft?.base[parameter.id] ?? parameter.default;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="flex h-[92vh] w-[min(1180px,96vw)] flex-col rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-sm font-medium">Live2D 模型设置</div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">
              标签属于模型，同一模型的所有朋友共用
            </div>
          </div>
          <button className="text-xs text-[var(--muted)]" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)_330px]">
          <aside className="min-h-0 overflow-y-auto border-r border-[var(--border)] p-3">
            <div className="mb-2 text-[11px] text-[var(--muted)]">模型</div>
            <div className="space-y-1">
              {models.map((model) => (
                <button
                  key={model.id}
                  className={`w-full rounded px-2 py-2 text-left text-xs ${
                    model.id === modelId
                      ? "bg-[var(--accent-soft)] text-[var(--text)]"
                      : "text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                  }`}
                  onClick={() => setModelId(model.id)}
                >
                  <div className="truncate">{model.name}</div>
                  <div className="mt-0.5 text-[10px] opacity-60">
                    {model.is_default
                      ? "内置默认"
                      : model.source === "user_data"
                        ? "本机模型"
                        : model.id}
                  </div>
                  {model.used_by.length > 0 && (
                    <div className="mt-0.5 truncate text-[10px] opacity-50">
                      使用：{model.used_by.join("、")}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 items-center justify-center bg-black/85 p-4">
            {meta ? (
              <Live2DCharacter
                modelUrl={meta.model.model_url}
                modelId={meta.model.id}
                mood={label?.name}
                settingsOverride={draft}
                expressionDefs={meta.expressions}
                onCoreReady={(core) => {
                  coreRef.current = core;
                }}
                className="h-full w-full max-w-[560px]"
              />
            ) : (
              <div className="text-xs text-white/50">{status || "选择一个模型"}</div>
            )}
          </section>

          <aside className="min-h-0 overflow-y-auto border-l border-[var(--border)] p-3">
            {draft && meta ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-[var(--muted)]">标签</div>
                  <button
                    className="text-[11px] text-[var(--accent)]"
                    onClick={() => {
                      const name = `新标签${draft.labels.length + 1}`;
                      setDraft({
                        ...draft,
                        labels: [
                          ...draft.labels,
                          {
                            id: `label_${Date.now()}`,
                            name,
                            params: {},
                            expressions: [],
                            transition_ms: null,
                          },
                        ],
                      });
                      setLabelIndex(draft.labels.length);
                    }}
                  >
                    新增
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {draft.labels.map((item, index) => (
                    <button
                      key={item.id}
                      className={`rounded px-2 py-1 text-[11px] ${
                        index === labelIndex
                          ? "bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border border-[var(--border)] text-[var(--muted)]"
                      }`}
                      onClick={() => setLabelIndex(index)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>

                {label && (
                  <>
                    <div className="space-y-2 border-t border-[var(--border)] pt-3">
                      <label className="block text-[11px] text-[var(--muted)]">
                        标签名
                        <input
                          className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs"
                          value={label.name}
                          onChange={(event) => {
                            const name = event.target.value;
                            updateLabel(labelIndex, (current) => ({ ...current, name }));
                            if (draft.default_label === label.name) {
                              setDraft((current) =>
                                current ? { ...current, default_label: name } : current,
                              );
                            }
                          }}
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          className="flex-1 rounded border border-[var(--border)] px-2 py-1 text-[11px]"
                          onClick={() => setDraft({ ...draft, default_label: label.name })}
                        >
                          {draft.default_label === label.name ? "默认标签" : "设为默认"}
                        </button>
                        <button
                          className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-500 disabled:opacity-40"
                          disabled={draft.default_label === label.name}
                          onClick={() => {
                            setDraft({
                              ...draft,
                              labels: draft.labels.filter((_, index) => index !== labelIndex),
                            });
                            setLabelIndex(Math.max(0, labelIndex - 1));
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[var(--border)] pt-3">
                      <div className="mb-2 text-[11px] text-[var(--muted)]">表情 / 特效</div>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {meta.expressions.map((expression) => (
                          <label
                            key={expression.name}
                            className="flex items-center gap-2 text-[11px] text-[var(--muted)]"
                          >
                            <input
                              type="checkbox"
                              checked={label.expressions.includes(expression.name)}
                              onChange={(event) =>
                                updateLabel(labelIndex, (current) => ({
                                  ...current,
                                  expressions: event.target.checked
                                    ? [...current.expressions, expression.name]
                                    : current.expressions.filter(
                                        (item) => item !== expression.name,
                                      ),
                                }))
                              }
                            />
                            <span className="truncate">{expression.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-[var(--border)] pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] text-[var(--muted)]">基础参数</span>
                        <button
                          className="text-[11px] text-[var(--accent)]"
                          onClick={() => {
                            const params: Record<string, number> = {};
                            for (const parameter of meta.parameters) {
                              const value = coreRef.current?.getParameterValueById?.(
                                parameter.id,
                              );
                              if (typeof value === "number") params[parameter.id] = value;
                            }
                            updateLabel(labelIndex, (current) => ({ ...current, params }));
                          }}
                        >
                          定格当前预览
                        </button>
                      </div>
                      <div className="space-y-2">
                        {basicParameters.map((parameter) => (
                          <ParamSlider
                            key={parameter.id}
                            parameter={parameter}
                            value={parameterValue(parameter)}
                            onChange={(value) =>
                              updateLabel(labelIndex, (current) => ({
                                ...current,
                                params: { ...current.params, [parameter.id]: value },
                              }))
                            }
                          />
                        ))}
                      </div>
                    </div>

                    <details
                      className="border-t border-[var(--border)] pt-3"
                      onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
                    >
                      <summary className="cursor-pointer text-[11px] text-[var(--muted)]">
                        高级参数
                      </summary>
                      <input
                        className="mt-2 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-[11px]"
                        placeholder="搜索参数"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      {advancedOpen && (
                        <div className="mt-2 space-y-2">
                          {advancedParameters.map((parameter) => (
                            <ParamSlider
                              key={parameter.id}
                              parameter={parameter}
                              value={parameterValue(parameter)}
                              onChange={(value) =>
                                updateLabel(labelIndex, (current) => ({
                                  ...current,
                                  params: { ...current.params, [parameter.id]: value },
                                }))
                              }
                            />
                          ))}
                        </div>
                      )}
                    </details>
                  </>
                )}

                <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button
                    className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white"
                    onClick={async () => {
                      try {
                        const result = await saveLive2DSettings(meta.model.id, draft);
                        setDraft(cloneSettings(result.settings));
                        setStatus("已保存");
                      } catch (error) {
                        setStatus(String(error));
                      }
                    }}
                  >
                    保存
                  </button>
                  {status && <span className="text-[11px] text-[var(--muted)]">{status}</span>}
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--muted)]">{status || "加载中…"}</div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
