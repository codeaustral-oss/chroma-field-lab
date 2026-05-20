# Contributing

Chroma Field Lab is built to be easy to inspect and fork. Good contributions include new field modes, pointer interactions, palette packs, and export improvements.

## Local setup

```bash
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run lint
npm run build
```

## Guidelines

- Keep the scene responsive when particle counts change.
- Dispose Three.js resources when replacing geometry.
- Prefer deterministic formulas so shared seeds are useful.
