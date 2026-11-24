const links = [
  {
    label: "yumeFriend · Apache-2.0",
    href: "https://github.com/YumeshioAmami/yumeFriend/blob/main/LICENSE",
  },
  {
    label: "yumeCore · Apache-2.0",
    href: "https://github.com/YumeshioAmami/yumeCore/blob/main/LICENSE",
  },
  {
    label: "YUI 模型来源与许可",
    href: "https://github.com/YumeshioAmami/yumeFriend/tree/main/desktop/public/live2d/yui",
  },
  {
    label: "Live2D 专有软件许可协议",
    href: "https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html",
  },
  {
    label: "Live2D 开源软件许可协议",
    href: "https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html",
  },
  {
    label: "第三方 JavaScript 依赖",
    href: "https://github.com/YumeshioAmami/yumeFriend/blob/main/desktop/package.json",
  },
  {
    label: "第三方 Python 依赖",
    href: "https://github.com/YumeshioAmami/yumeFriend/blob/main/desktop/backend/pyproject.toml",
  },
];

export function LegalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
      <div className="modal-card w-[520px]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-stone-900">法律说明</h2>
          <button
            type="button"
            className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <p className="mt-3 text-xs leading-6 text-[var(--muted)]">
          yumeFriend 与 yumeCore 按 Apache-2.0 开源。默认 YUI 模型和立绘按 Apache-2.0
          分发；Live2D Cubism Core 不随仓库分发，使用前需同意 Live2D 官方协议。其他依赖的许可证见对应依赖清单。
        </p>
        <div className="mt-4 space-y-2">
          {links.map((link) => (
            <a
              key={link.href}
              className="block text-sm text-[var(--accent)] underline"
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
