# Fusée Framework Benchmark Suite

Compară performanța Fusée cu React, Vue, Angular, Svelte, Solid, Preact și Qwik
folosind 4 teste de stress standard (inspirate din [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)):

| Test      | Descriere                                              |
|-----------|---------------------------------------------------------|
| `create`  | Creează 1.000 de rânduri într-un tabel gol               |
| `update`  | Actualizează label-ul fiecărui al 10-lea rând (100 total)|
| `swap`    | Interschimbă 2 rânduri (poziția 2 și 999)                |
| `clear`   | Șterge toate rândurile din tabel                          |

Toate rulează **headless, din terminal**, cu Playwright + Chromium, măsurând timpul
real de randare în browser via `performance.now()`.

## Instalare

```bash
cd benchmarks
npm install
npm run install:apps   # instalează dependențele fiecărei aplicații
npm run build:apps     # buildează fiecare aplicație (producție)
npx playwright install chromium
```

## Rulare

```bash
npm run bench           # rulează toate framework-urile, toate testele
npm run bench -- --only=fusee,react   # doar anumite framework-uri
npm run bench -- --runs=10            # numărul de măsurători (default 15)
```

Rezultatele apar în terminal ca tabel, și sunt salvate în `results/latest.json`
și `results/latest.md`.

## Structura

```
benchmarks/
├── apps/
│   ├── fusee/      # aplicație Fusée (folosește noul compiler)
│   ├── react/
│   ├── vue/
│   ├── angular/
│   ├── svelte/
│   ├── solid/
│   ├── preact/
│   └── qwik/
├── runner/
│   ├── run.mjs         # orchestrator principal (CLI)
│   ├── measure.mjs      # logica Playwright de măsurare
│   ├── report.mjs      # generare tabel + markdown
│   └── config.mjs      # config framework-uri, porturi, teste
└── results/
    ├── latest.json
    └── latest.md
```

## Cum funcționează fiecare test

Fiecare aplicație expune pe `window` 4 funcții async, apelate direct din Playwright
(fără click-uri UI, pentru măsurători exacte, izolate de input lag):

```js
window.__bench = {
  create(n),   // creează n rânduri
  update(),    // update la fiecare al 10-lea rând
  swap(),      // swap rând 2 <-> 999
  clear(),     // golește tabelul
}
```

Runner-ul așteaptă un `requestAnimationFrame` dublu + `MutationObserver` idle
pentru a se asigura că DOM-ul e complet actualizat înainte de a opri cronometrul.
