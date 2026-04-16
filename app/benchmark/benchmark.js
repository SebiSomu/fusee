import { signal, batch } from '../../framework/core/signal.js';
import { mountTemplate } from '../../framework/core/compiler.js';

// ─── Configuration ────────────────────────────────────────────────────────

const WARMUP_RUNS = 5;
const MEASURE_RUNS = 5;

const BENCHMARK_WEIGHTS = {
  create: 1.0,
  replace: 1.0,
  partial: 0.5,
  select: 0.5,
  swap: 1.0,
  remove: 1.0,
  createMany: 1.0,
  append: 0.5,
  clear: 1.0
};

const BASELINE = {
  create: 50,
  replace: 55,
  partial: 20,
  select: 10,
  swap: 15,
  remove: 10,
  createMany: 500,
  append: 60,
  clear: 15
};

// ─── State ─────────────────────────────────────────────────────────────────

let idCounter = 1;
const results = {};
const previewContainer = document.getElementById('previewContainer');
let currentMode = 'fusée';

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildRow(id) {
  return { id, label: signal(`Row ${id}`), selected: signal(false) };
}

function createRows(count) {
  return Array.from({ length: count }, (_, i) => buildRow(idCounter++));
}

function warmup(fn, times = WARMUP_RUNS) {
  for (let i = 0; i < times; i++) fn();
}

function measureBenchmark(name, fn) {
  // Warmup
  warmup(fn);
  
  // Measure
  const times = [];
  for (let i = 0; i < MEASURE_RUNS; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }
  
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return { name, mean, min, max, times };
}

function renderTable(rows, container) {
  const context = {
    rows,
    selectedId: signal(null),
    selectRow(id) {
      batch(() => {
        const prev = rows.find(r => r.id === context.selectedId());
        if (prev) prev.selected(false);
        context.selectedId(id);
        const next = rows.find(r => r.id === id);
        if (next) next.selected(true);
      });
    }
  };

  const template = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Label</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr f-for="row in rows" :class="row.selected() ? 'selected' : ''">
          <td>{{ row.id }}</td>
          <td>{{ row.label() }}</td>
          <td>
            <button @click="selectRow(row.id)">Select</button>
            <button @click="rows.splice(rows.indexOf(row), 1)">Remove</button>
          </td>
        </tr>
      </tbody>
    </table>
  `;

  return mountTemplate(template, container, context, {});
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

const benchmarks = {
  create: () => {
    idCounter = 1;
    previewContainer.innerHTML = '';
    const rows = createRows(1000);
    renderTable(rows, previewContainer);
  },

  replace: () => {
    idCounter = 1;
    previewContainer.innerHTML = '';
    const rows = createRows(1000);
    const items = signal(rows);
    renderTable(items, previewContainer);
    
    idCounter = 1;
    items(createRows(1000));
  },

  partial: () => {
    idCounter = 1;
    const rows = createRows(1000);
    renderTable(rows, previewContainer);
    
    rows.forEach((r, i) => r.label(`Row ${r.id}`));
    batch(() => {
      for (let i = 0; i < rows.length; i += 10) {
        rows[i].label(`${rows[i].label()} !!!`);
      }
    });
  },

  select: () => {
    idCounter = 1;
    const rows = createRows(1000);
    const context = {
      rows,
      selectedId: signal(null),
      selectRow(id) {
        batch(() => {
          const prev = rows.find(r => r.id === context.selectedId());
          if (prev) prev.selected(false);
          context.selectedId(id);
          const next = rows.find(r => r.id === id);
          if (next) next.selected(true);
        });
      }
    };
    
    const template = `
      <table>
        <thead><tr><th>ID</th><th>Label</th></tr></thead>
        <tbody>
          <tr f-for="row in rows" :class="row.selected() ? 'selected' : ''">
            <td>{{ row.id }}</td>
            <td>{{ row.label() }}</td>
          </tr>
        </tbody>
      </table>
    `;
    mountTemplate(template, previewContainer, context, {});
    context.selectRow(rows[41].id);
  },

  swap: () => {
    idCounter = 1;
    const rows = createRows(1000);
    const items = signal(rows);
    renderTable(items, previewContainer);
    
    batch(() => {
      const current = items();
      const tmp = current[1];
      current[1] = current[998];
      current[998] = tmp;
      items(current);
    });
  },

  remove: () => {
    idCounter = 1;
    const rows = createRows(1000);
    const items = signal(rows);
    renderTable(items, previewContainer);
    
    const targetId = items()[41].id;
    batch(() => {
      items(items().filter(r => r.id !== targetId));
    });
  },

  createMany: () => {
    idCounter = 1;
    previewContainer.innerHTML = '';
    const rows = createRows(10000);
    renderTable(rows, previewContainer);
  },

  append: () => {
    idCounter = 1;
    const rows = createRows(1000);
    const items = signal(rows);
    renderTable(items, previewContainer);
    
    const extra = createRows(1000);
    items([...items(), ...extra]);
  },

  clear: () => {
    idCounter = 1;
    const rows = createRows(1000);
    const items = signal(rows);
    renderTable(items, previewContainer);
    
    batch(() => {
      items([]);
    });
  }
};

// ─── UI ─────────────────────────────────────────────────────────────────────

function updateResultCard(benchmarkName, result) {
  const card = document.querySelector(`[data-benchmark="${benchmarkName}"]`);
  if (!card) return;
  
  const resultDiv = card.querySelector('.result');
  resultDiv.innerHTML = `
    <span class="time">${result.mean.toFixed(2)}ms</span>
    <span class="status">(min: ${result.min.toFixed(2)}ms, max: ${result.max.toFixed(2)}ms)</span>
  `;
}

function calculateWGM() {
  const keys = Object.keys(BENCHMARK_WEIGHTS);
  const missingKeys = keys.filter(k => !(k in results));
  
  if (missingKeys.length > 0) {
    console.warn(`[WGM] Lipsesc rezultate pentru: ${missingKeys.join(', ')}`);
    return null;
  }
  
  const totalWeight = keys.reduce((sum, k) => sum + BENCHMARK_WEIGHTS[k], 0);
  const weightedSum = keys.reduce((sum, k) => {
    const ratio = results[k].mean / BASELINE[k];
    return sum + BENCHMARK_WEIGHTS[k] * Math.log(ratio);
  }, 0);
  
  return Math.exp(weightedSum / totalWeight);
}

function updateSummary() {
  const wgm = calculateWGM();
  const wgmDiv = document.getElementById('wgmResult');
  const detailsDiv = document.getElementById('details');
  
  if (wgm === null) {
    wgmDiv.innerHTML = '<span class="indicator">⏳</span> Run all benchmarks to see results';
    return;
  }
  
  const indicator = wgm < 1 ? '🟢' : wgm < 2 ? '🟡' : '🔴';
  wgmDiv.innerHTML = `
    <span class="indicator">${indicator}</span> WGM Score: <span class="score">${wgm.toFixed(3)}x</span> baseline
  `;
  
  let tableHtml = '<table><thead><tr><th>Benchmark</th><th>Mean (ms)</th><th>Ratio</th></tr></thead><tbody>';
  
  for (const [key, weight] of Object.entries(BENCHMARK_WEIGHTS)) {
    if (results[key]) {
      const ratio = (results[key].mean / BASELINE[key]).toFixed(2);
      tableHtml += `<tr><td>${key}</td><td>${results[key].mean.toFixed(2)}</td><td>${ratio}x</td></tr>`;
    }
  }
  
  tableHtml += '</tbody></table>';
  detailsDiv.innerHTML = tableHtml;
}

function runBenchmark(benchmarkName) {
  const benchmark = benchmarks[benchmarkName];
  if (!benchmark) return;
  
  const card = document.querySelector(`[data-benchmark="${benchmarkName}"]`);
  const resultDiv = card.querySelector('.result');
  resultDiv.innerHTML = '<span class="status">Running...</span>';
  
  // Use setTimeout to allow UI to update
  setTimeout(() => {
    try {
      const result = measureBenchmark(benchmarkName, benchmark);
      results[benchmarkName] = result;
      updateResultCard(benchmarkName, result);
      updateSummary();
    } catch (error) {
      resultDiv.innerHTML = `<span class="status" style="color: red">Error: ${error.message}</span>`;
      console.error(error);
    }
  }, 100);
}

function runAllBenchmarks() {
  for (const key of Object.keys(benchmarks)) {
    runBenchmark(key);
  }
}

function clearResults() {
  for (const key of Object.keys(results)) {
    delete results[key];
  }
  
  document.querySelectorAll('.result').forEach(el => {
    el.innerHTML = '';
  });
  
  document.getElementById('wgmResult').innerHTML = '';
  document.getElementById('details').innerHTML = '';
  previewContainer.innerHTML = '';
}

// ─── Event Listeners ───────────────────────────────────────────────────────

document.getElementById('runAll').addEventListener('click', runAllBenchmarks);
document.getElementById('clear').addEventListener('click', clearResults);

document.querySelectorAll('.run-benchmark').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const card = e.target.closest('.benchmark-card');
    const benchmarkName = card.dataset.benchmark;
    runBenchmark(benchmarkName);
  });
});

// ─── Vanilla JS Benchmarks ─────────────────────────────────────────────────

let vanillaIdCounter = 1;
const vanillaResults = {};

function vanillaBuildRow(id) {
  return { id, label: `Row ${id}`, selected: false };
}

function vanillaCreateRows(count) {
  return Array.from({ length: count }, (_, i) => vanillaBuildRow(vanillaIdCounter++));
}

function vanillaRenderTable(rows, container) {
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Label</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="vanillaTableBody"></tbody>
    </table>
  `;
  
  const tbody = container.querySelector('#vanillaTableBody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    tr.innerHTML = `
      <td>${row.id}</td>
      <td class="label">${row.label}</td>
      <td>
        <button class="select-btn">Select</button>
        <button class="remove-btn">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  container.rows = rows;
}

const vanillaBenchmarks = {
  create: () => {
    vanillaIdCounter = 1;
    previewContainer.innerHTML = '';
    const rows = vanillaCreateRows(1000);
    vanillaRenderTable(rows, previewContainer);
  },

  replace: () => {
    vanillaIdCounter = 1;
    previewContainer.innerHTML = '';
    const rows = vanillaCreateRows(1000);
    vanillaRenderTable(rows, previewContainer);
    
    vanillaIdCounter = 1;
    const newRows = vanillaCreateRows(1000);
    vanillaRenderTable(newRows, previewContainer);
  },

  partial: () => {
    vanillaIdCounter = 1;
    const rows = vanillaCreateRows(1000);
    vanillaRenderTable(rows, previewContainer);
    
    for (let i = 0; i < rows.length; i += 10) {
      rows[i].label += ' !!!';
      const tr = previewContainer.querySelector(`tr[data-id="${rows[i].id}"]`);
      if (tr) {
        tr.querySelector('.label').textContent = rows[i].label;
      }
    }
  },

  select: () => {
    vanillaIdCounter = 1;
    const rows = vanillaCreateRows(1000);
    previewContainer.innerHTML = `
      <table>
        <thead><tr><th>ID</th><th>Label</th></tr></thead>
        <tbody id="vanillaTableBody"></tbody>
      </table>
    `;
    const tbody = previewContainer.querySelector('#vanillaTableBody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id;
      tr.innerHTML = `<td>${row.id}</td><td class="label">${row.label}</td>`;
      tbody.appendChild(tr);
    });
    
    const targetRow = rows[41];
    const tr = previewContainer.querySelector(`tr[data-id="${targetRow.id}"]`);
    if (tr) tr.classList.add('selected');
  },

  swap: () => {
    vanillaIdCounter = 1;
    const rows = vanillaCreateRows(1000);
    vanillaRenderTable(rows, previewContainer);
    
    const tmp = rows[1];
    rows[1] = rows[998];
    rows[998] = tmp;
    vanillaRenderTable(rows, previewContainer);
  },

  remove: () => {
    vanillaIdCounter = 1;
    const rows = vanillaCreateRows(1000);
    vanillaRenderTable(rows, previewContainer);
    
    const targetId = rows[41].id;
    const tr = previewContainer.querySelector(`tr[data-id="${targetId}"]`);
    if (tr) tr.remove();
  },

  createMany: () => {
    vanillaIdCounter = 1;
    previewContainer.innerHTML = '';
    const rows = vanillaCreateRows(10000);
    vanillaRenderTable(rows, previewContainer);
  },

  append: () => {
    vanillaIdCounter = 1;
    const rows = vanillaCreateRows(1000);
    vanillaRenderTable(rows, previewContainer);
    
    const extra = vanillaCreateRows(1000);
    rows.push(...extra);
    vanillaRenderTable(rows, previewContainer);
  },

  clear: () => {
    vanillaIdCounter = 1;
    const rows = vanillaCreateRows(1000);
    vanillaRenderTable(rows, previewContainer);
    
    previewContainer.innerHTML = '';
  }
};

function vanillaUpdateResultCard(benchmarkName, result) {
  const card = document.querySelector(`[data-benchmark="${benchmarkName}"]`);
  if (!card) return;
  
  const resultDiv = card.querySelector('.result');
  resultDiv.innerHTML = `
    <span class="time" style="color: #e74c3c">${result.mean.toFixed(2)}ms (Vanilla)</span>
    <span class="status">(min: ${result.min.toFixed(2)}ms, max: ${result.max.toFixed(2)}ms)</span>
  `;
}

function vanillaCalculateWGM() {
  const keys = Object.keys(BENCHMARK_WEIGHTS);
  const missingKeys = keys.filter(k => !(k in vanillaResults));
  
  if (missingKeys.length > 0) {
    console.warn(`[WGM Vanilla] Lipsesc rezultate pentru: ${missingKeys.join(', ')}`);
    return null;
  }
  
  const totalWeight = keys.reduce((sum, k) => sum + BENCHMARK_WEIGHTS[k], 0);
  const weightedSum = keys.reduce((sum, k) => {
    const ratio = vanillaResults[k].mean / BASELINE[k];
    return sum + BENCHMARK_WEIGHTS[k] * Math.log(ratio);
  }, 0);
  
  return Math.exp(weightedSum / totalWeight);
}

function vanillaUpdateSummary() {
  const wgm = vanillaCalculateWGM();
  const wgmDiv = document.getElementById('wgmResult');
  const detailsDiv = document.getElementById('details');
  
  if (wgm === null) {
    return;
  }
  
  const indicator = wgm < 1 ? '🟢' : wgm < 2 ? '🟡' : '🔴';
  wgmDiv.innerHTML = `
    <span class="indicator">${indicator}</span> Vanilla JS: <span class="score">${wgm.toFixed(3)}x</span> baseline
  `;
  
  let tableHtml = '<table style="margin-top: 20px"><thead><tr><th>Benchmark</th><th>Vanilla Mean (ms)</th><th>Ratio</th></tr></thead><tbody>';
  
  for (const [key, weight] of Object.entries(BENCHMARK_WEIGHTS)) {
    if (vanillaResults[key]) {
      const ratio = (vanillaResults[key].mean / BASELINE[key]).toFixed(2);
      tableHtml += `<tr><td>${key}</td><td>${vanillaResults[key].mean.toFixed(2)}</td><td>${ratio}x</td></tr>`;
    }
  }
  
  tableHtml += '</tbody></table>';
  detailsDiv.innerHTML = tableHtml;
}

function vanillaRunBenchmark(benchmarkName) {
  const benchmark = vanillaBenchmarks[benchmarkName];
  if (!benchmark) return;
  
  const card = document.querySelector(`[data-benchmark="${benchmarkName}"]`);
  const resultDiv = card.querySelector('.result');
  resultDiv.innerHTML = '<span class="status">Running Vanilla...</span>';
  
  setTimeout(() => {
    try {
      const result = measureBenchmark(benchmarkName, benchmark);
      vanillaResults[benchmarkName] = result;
      vanillaUpdateResultCard(benchmarkName, result);
      vanillaUpdateSummary();
    } catch (error) {
      resultDiv.innerHTML = `<span class="status" style="color: red">Error: ${error.message}</span>`;
      console.error(error);
    }
  }, 100);
}

function vanillaRunAllBenchmarks() {
  for (const key of Object.keys(vanillaBenchmarks)) {
    vanillaRunBenchmark(key);
  }
}

function vanillaClearResults() {
  for (const key of Object.keys(vanillaResults)) {
    delete vanillaResults[key];
  }
  
  document.getElementById('wgmResult').innerHTML = '';
  document.getElementById('details').innerHTML = '';
  previewContainer.innerHTML = '';
}

// ─── Vanilla JS Event Listeners ─────────────────────────────────────────────

document.getElementById('runAll').addEventListener('click', () => {
  if (currentMode === 'fusée') {
    runAllBenchmarks();
  } else {
    vanillaRunAllBenchmarks();
  }
});

document.getElementById('clear').addEventListener('click', () => {
  clearResults();
  vanillaClearResults();
});

document.querySelectorAll('.run-benchmark').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const card = e.target.closest('.benchmark-card');
    const benchmarkName = card.dataset.benchmark;
    if (currentMode === 'fusée') {
      runBenchmark(benchmarkName);
    } else {
      vanillaRunBenchmark(benchmarkName);
    }
  });
});

// ─── Mode Switching ─────────────────────────────────────────────────────

document.getElementById('runFusée').addEventListener('click', () => {
  currentMode = 'fusée';
  document.getElementById('runFusée').classList.add('active');
  document.getElementById('runVanilla').classList.remove('active');
  clearResults();
  vanillaClearResults();
});

document.getElementById('runVanilla').addEventListener('click', () => {
  currentMode = 'vanilla';
  document.getElementById('runVanilla').classList.add('active');
  document.getElementById('runFusée').classList.remove('active');
  clearResults();
  vanillaClearResults();
});
