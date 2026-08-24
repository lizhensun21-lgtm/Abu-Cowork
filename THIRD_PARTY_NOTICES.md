# Third-Party Notices

Abu Project Management — RC1 Preview is an independent Project Management
edition based on Abu v0.34.2. The upstream Abu source is licensed under the
Apache License 2.0; the complete license and copyright notice are shipped as
`legal/LICENSE`.

The packaged application also contains third-party software. Its license
material remains with the corresponding runtime or resource:

- Electron and Chromium license files generated with the packaged runtime.
- The bundled Node.js runtime, including its `LICENSE` and dependency notices.
- The bundled Python runtime, including `LICENSE.txt`, `PYTHON_LICENSE.txt`,
  `THIRD_PARTY_NOTICES.json`, and package-specific license files.
- Built-in skills and agents, including their package-level license files.
- JavaScript dependencies declared by `package-lock.json` and bundled into the
  Electron main process, renderer, and sidecar.

This file is an auditable packaging index, not a replacement for the individual
license texts. Before public distribution, the release owner must review the
resolved JavaScript dependency tree and add any dependency-specific attribution
or notice text that its license requires.
