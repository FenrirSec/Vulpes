# Bundled third-party assets (demo only)

These files power the in-browser terminal of the Vulpes demo (`docs/index.html`).
They are only used by the static demo and are **not** part of Vulpes itself.

## v86/ — x86 emulator (WebAssembly)

- `libv86.js`, `v86.wasm`, `seabios.bin`, `vgabios.bin` — from
  [copy/v86](https://github.com/copy/v86), licensed **BSD-2-Clause**.
- `buildroot-bzimage68.bin` — a minimal Linux 6.8 kernel + BusyBox root filesystem
  built with [Buildroot](https://buildroot.org/) (image distributed with v86). The
  Linux kernel is **GPLv2** and BusyBox is **GPLv2**; corresponding sources are
  available from kernel.org, busybox.net and the Buildroot project.

The VM has no network and runs entirely client-side.

## xterm/ — terminal front-end

- `xterm.js`, `xterm.css`, `addon-fit.js` — from
  [@xterm/xterm](https://github.com/xtermjs/xterm.js), licensed **MIT**.

To refresh these, re-fetch them from the upstream projects above.
