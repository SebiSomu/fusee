// framework/__tests__/benchmark.test.js
import { describe, it, expect } from 'vitest';
import { signal, batch } from '../core/signal.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

let idCounter = 1;

function buildRow(id) {
  return { id, label: signal(`Row ${id}`), selected: signal(false) };
}

function createRows(count) {
  return Array.from({ length: count }, (_, i) => buildRow(idCounter++));
}

function warmup(fn, times = 5) {
  for (let i = 0; i < times; i++) fn();
}

// ─── Rezultate pentru WGM ──────────────────────────────────────────────────

const results = {};

function record(name, duration) {
  results[name] = duration;
  console.log(`[${name}] ${duration.toFixed(2)}ms`);
}

// ─── Benchmark Tests ───────────────────────────────────────────────────────

describe('Fusée Benchmark — Reactivity Only (no rendering)', () => {

  // 1. Create Rows - creare signal-uri
  it('create rows — 1,000 rows (5 warmup runs)', () => {
    warmup(() => {
      idCounter = 1;
      createRows(1000);
    }, 5);

    idCounter = 1;
    const start = performance.now();
    const rows = createRows(1000);
    const duration = performance.now() - start;

    expect(rows).toHaveLength(1000);
    record('create rows', duration);
  });

  // 2. Replace All Rows - update signal cu array nou
  it('replace all rows — update signal 1,000 rows (5 warmup runs)', () => {
    const items = signal(createRows(1000));

    warmup(() => {
      idCounter = 1;
      items(createRows(1000));
    }, 5);

    idCounter = 1;
    const start = performance.now();
    items(createRows(1000));
    const duration = performance.now() - start;

    expect(items()).toHaveLength(1000);
    record('replace all rows', duration);
  });

  // 3. Partial Update - update subset de signal-uri
  it('partial update — every 10th row, 1,000 rows (3 warmup runs)', () => {
    const rows = createRows(1000);

    function updateEvery10th() {
      batch(() => {
        for (let i = 0; i < rows.length; i += 10) {
          rows[i].label(`${rows[i].label()} !!!`);
        }
      });
    }

    warmup(updateEvery10th, 3);
    rows.forEach((r, i) => r.label(`Row ${r.id}`));

    const start = performance.now();
    updateEvery10th();
    const duration = performance.now() - start;

    expect(rows[0].label()).toContain('!!!');
    expect(rows[1].label()).not.toContain('!!!');
    record('partial update', duration);
  });

  // 4. Select Row - update signal de selecție
  it('select row — update selection signal (5 warmup runs)', () => {
    const rows = createRows(1000);
    const selectedId = signal(null);

    function selectRow(id) {
      batch(() => {
        const prev = rows.find(r => r.id === selectedId());
        if (prev) prev.selected(false);
        selectedId(id);
        const next = rows.find(r => r.id === id);
        if (next) next.selected(true);
      });
    }

    warmup(() => selectRow(Math.floor(Math.random() * 1000) + 1), 5);

    const start = performance.now();
    selectRow(rows[41].id);
    const duration = performance.now() - start;

    expect(rows[41].selected()).toBe(true);
    expect(rows[0].selected()).toBe(false);
    record('select row', duration);
  });

  // 5. Swap Rows - array mutation + signal update
  it('swap rows — swap row 2 and 999 (5 warmup runs)', () => {
    const items = signal(createRows(1000));

    function swapRows() {
      batch(() => {
        const current = items();
        const tmp = current[1];
        current[1] = current[998];
        current[998] = tmp;
        items(current);
      });
    }

    warmup(swapRows, 5);
    idCounter = 1;
    items(createRows(1000));

    const idAt1 = items()[1].id;
    const idAt998 = items()[998].id;

    const start = performance.now();
    swapRows();
    const duration = performance.now() - start;

    expect(items()[1].id).toBe(idAt998);
    expect(items()[998].id).toBe(idAt1);
    record('swap rows', duration);
  });

  // 6. Remove Row - filter array + signal update
  it('remove row — remove one row from 1,000 (5 warmup runs)', () => {
    const items = signal(createRows(1000));

    function removeRow(id) {
      batch(() => {
        items(items().filter(r => r.id !== id));
      });
    }

    warmup(() => {
      idCounter = 1;
      items(createRows(1000));
      removeRow(items()[41].id);
    }, 5);

    idCounter = 1;
    items(createRows(1000));
    const targetId = items()[41].id;

    const start = performance.now();
    removeRow(targetId);
    const duration = performance.now() - start;

    expect(items().find(r => r.id === targetId)).toBeUndefined();
    expect(items().length).toBe(999);
    record('remove row', duration);
  });

  // 7. Create Many Rows - creare 10000 signal-uri
  it('create many rows — 10,000 rows (5 warmup runs)', () => {
    warmup(() => {
      idCounter = 1;
      createRows(10000);
    }, 5);

    idCounter = 1;
    const start = performance.now();
    const rows = createRows(10000);
    const duration = performance.now() - start;

    expect(rows).toHaveLength(10000);
    record('create many rows', duration);
  });

  // 8. Append Rows - concatenare array + signal update
  it('append rows to large table — 1,000 + 1,000 (5 warmup runs)', () => {
    const items = signal(createRows(1000));

    warmup(() => {
      const extra = createRows(1000);
      items([...items(), ...extra]);
    }, 5);

    idCounter = 1;
    items(createRows(1000));

    const start = performance.now();
    const extra = createRows(1000);
    items([...items(), ...extra]);
    const duration = performance.now() - start;

    expect(items().length).toBe(2000);
    record('append rows to large table', duration);
  });

  // 9. Clear Rows - reset signal la []
  it('clear rows — clear 1,000 rows (5 warmup runs)', () => {
    const items = signal(createRows(1000));

    function clearRows() {
      batch(() => {
        items([]);
      });
    }

    warmup(() => {
      idCounter = 1;
      items(createRows(1000));
      clearRows();
    }, 5);

    idCounter = 1;
    items(createRows(1000));

    const start = performance.now();
    clearRows();
    const duration = performance.now() - start;

    expect(items().length).toBe(0);
    record('clear rows', duration);
  });

  // ─── Weighted Geometric Mean ─────────────────────────────────────────────

  it('WGM — Weighted Geometric Mean of all benchmarks', () => {
    // Weights conform js-framework-benchmark oficial
    const weights = {
      'create rows':              1.0,
      'replace all rows':         1.0,
      'partial update':           0.5,
      'select row':               0.5,
      'swap rows':                1.0,
      'remove row':               1.0,
      'create many rows':         1.0,
      'append rows to large table': 0.5,
      'clear rows':               1.0,
    };

    // Referință baseline (ms) — valori realiste pentru reactivitate pură
    const baseline = {
      'create rows':              5,      // 1000 signal-uri
      'replace all rows':         3,      // update signal cu array nou
      'partial update':           2,      // 100 signal updates
      'select row':               1.5,    // 2 signal updates
      'swap rows':                1.5,    // array mutation + signal update
      'remove row':               1,      // filter + signal update
      'create many rows':         15,     // 10000 signal-uri
      'append rows to large table': 12,   // concatenare + signal update
      'clear rows':               1,      // reset signal la []
    };

    const keys = Object.keys(weights);
    const missingKeys = keys.filter(k => !(k in results));

    if (missingKeys.length > 0) {
      console.warn(`[WGM] Lipsesc rezultate pentru: ${missingKeys.join(', ')}`);
      return;
    }

    // WGM = exp( Σ(w_i * ln(t_i / baseline_i)) / Σ(w_i) )
    const totalWeight = keys.reduce((sum, k) => sum + weights[k], 0);
    const weightedSum = keys.reduce((sum, k) => {
      const ratio = results[k] / baseline[k];
      return sum + weights[k] * Math.log(ratio);
    }, 0);

    const wgm = Math.exp(weightedSum / totalWeight);

    console.log('\n══════════════════════════════════════');
    console.log('  Fusée Reactivity Benchmark Results');
    console.log('══════════════════════════════════════');
    keys.forEach(k => {
      const ratio = (results[k] / baseline[k]).toFixed(2);
      console.log(`  ${k.padEnd(30)} ${results[k].toFixed(3).padStart(8)}ms  (${ratio}x baseline)`);
    });
    console.log('──────────────────────────────────────');
    console.log(`  WGM Score: ${wgm.toFixed(3)}x  ${wgm < 1 ? '🟢 faster than baseline' : wgm < 2 ? '🟡 acceptable' : '🔴 slower than baseline'}`);
    console.log('══════════════════════════════════════\n');

    expect(typeof wgm).toBe('number');
    expect(wgm).toBeGreaterThan(0);
  });
});