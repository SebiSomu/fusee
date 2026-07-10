import { signal, batch } from "../../../../framework/core/signal.js";
import { mount } from "../../../../framework/core/h.js";
import { render } from "./App.template.html";

let idCounter = 1;
const container = document.getElementById("app");
const rows = signal([]);

function buildRow(id) {
  return { id, label: signal(`row ${id}`) };
}

function buildRows(count) {
  return Array.from({ length: count }, () => buildRow(idCounter++));
}

const ctx = { rows };

mount(render, ctx, {}, container);

window.__bench = {
  create(n) {
    idCounter = 1;
    rows(buildRows(n));
  },
  update() {
    batch(() => {
      const current = rows();
      for (let i = 0; i < current.length; i += 10) {
        current[i].label(current[i].label() + " !!!");
      }
    });
  },
  swap() {
    batch(() => {
      const current = rows().slice();
      if (current.length > 998) {
        const tmp = current[1];
        current[1] = current[998];
        current[998] = tmp;
        rows(current);
      }
    });
  },
  clear() {
    rows([]);
  },
  rowCount() {
    return document.querySelectorAll(".col-id").length;
  },
};
