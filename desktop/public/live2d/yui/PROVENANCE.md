# YUI Live2D default model

- Model: **YUI** (`yui-origin`)
- Project: **Project N.E.K.O.**
- Source: <https://github.com/Project-N-E-K-O/N.E.K.O>
- Source commit: `d597dae4c862c57d7b45c4cd579313d3cd6a004b`
- Upstream asset: `assets/yui-origin.tar.gz`
- License: **Apache-2.0** (see `LICENSE` and `NOTICE`)

## Runtime asset facts

- `yui-origin.moc3` SHA-256:
  `3c384bb881607f7bcd23a7d64b63f2b285a3e3833cb2546f4be56387a0df7811`
- Runtime atlas SHA-256:
  `5f93ed26203c7d70ce0f2c469322e5357077f9ba58dc4f3351fd6aef51d2d9bc`
- 261 parameters, 30 parameter groups, 26 expression entries, 40 motion3
  files, and a 4096 x 4096 texture atlas.

## Changes made by yumeFriend

1. Extracted the `yui-origin` runtime directory from the upstream
   `assets/yui-origin.tar.gz`.
2. Renamed the unreferenced expression file `娴佹睏.exp3.json` to
   `sweat.exp3.json` so the filename is ASCII-safe. Its JSON content was not
   changed.
3. Added a yumeFriend-specific bundled mood preset mapping the 20 mood labels
   to YUI's expression toggles:
   `assets/live2d/model_settings/3c384bb881607f7b.json`.
4. Added `preview.png`, rendered from the runtime model by yumeFriend.
5. No moc3, model3, motion3, physics3, or expression content was edited.

The upstream project is licensed under Apache-2.0. Its `NOTICE` file is kept
verbatim next to this document. The YUI model asset is distributed as part of
that repository; no separate third-party model exclusion is listed for it in
the upstream `NOTICE`.

Live2D Cubism Core itself is proprietary and is not included here. Its use is
governed separately by Live2D Inc.'s SDK terms.

This project is not affiliated with Live2D Inc. or Project N.E.K.O.
