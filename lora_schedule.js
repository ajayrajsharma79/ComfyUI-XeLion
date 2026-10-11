import { app } from "../../scripts/app.js";

const CLASS = "MultiLoraSchedule";
const DEFAULT_ROW = () => ({ name: "", enabled: true, strength: 1, schedule_enabled: false, start: 0, end: 100 });

function readState(node) {
  if (!node.properties) node.properties = {};
  if (!Array.isArray(node.properties.loras)) node.properties.loras = [DEFAULT_ROW()];
  return node.properties.loras;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function isTargetNode(node) {
  return node?.comfyClass === CLASS || node?.type === CLASS || node?.constructor?.comfyClass === CLASS;
}

function installScheduleStyles() {
  if (document.getElementById("xe-lora-schedule-styles")) return;
  const style = document.createElement("style");
  style.id = "xe-lora-schedule-styles";
  style.textContent = `
    .xe-lora-schedule { font-family: Inter, "Segoe UI", system-ui, sans-serif; font-size: 12px; line-height: 1.35; color: #dedede; }
    .xe-lora-schedule button, .xe-lora-schedule select, .xe-lora-schedule input { font-family: inherit; font-size: 11px; line-height: 1.2; letter-spacing: .01em; }
    .xe-lora-schedule select, .xe-lora-schedule input[type="number"] { color: #f0f0f0; background: #171717; border: 1px solid #414141; border-radius: 4px; box-sizing: border-box; }
    .xe-lora-schedule select { min-height: 24px; padding: 2px 6px; }
    .xe-lora-schedule input[type="number"] { min-height: 24px; padding: 2px 5px; font-variant-numeric: tabular-nums; }
    .xe-lora-schedule label { font-size: 11px; font-weight: 500; color: #c8c8c8; }
    .xe-lora-schedule__row { border-color: #414141 !important; background: rgba(255,255,255,.035); }
    .xe-lora-schedule__add { color: #fff; background: #e87522; font-weight: 600; border: 1px solid #f18a3b; border-radius: 5px; cursor: pointer; }
    .xe-lora-schedule__add:hover { background: #f1842b; border-color: #ffa04d; }
    .xe-lora-schedule__remove:hover { border-color: #888; filter: brightness(1.12); }
    .xe-lora-schedule__remove { font-weight: 600; color: #d9d9d9; border: 1px solid #494949; border-radius: 4px; cursor: pointer; }
  `;
  document.head.appendChild(style);
}

function addNativeWidgetFallback(node, loraNames) {
  const rows = readState(node);
  const removeOld = () => {
    node.widgets = (node.widgets || []).filter(widget => !widget._xeLoraSchedule);
  };
  const mark = widget => { widget._xeLoraSchedule = true; return widget; };
  const changed = () => { node.properties.loras = readState(node); node.setDirtyCanvas(true, true); };
  removeOld();
  mark(node.addWidget("button", "+ Add LoRA", null, () => {
    rows.push(DEFAULT_ROW()); addNativeWidgetFallback(node, loraNames); changed();
  }));
  rows.forEach((row, index) => {
    mark(node.addWidget("combo", `LoRA ${index + 1}`, row.name || "", value => {
      row.name = value; changed();
    }, { values: ["", ...loraNames] }));
    mark(node.addWidget("toggle", "Enabled", row.enabled !== false, value => { row.enabled = !!value; changed(); }));
    mark(node.addWidget("number", "Strength", Number(row.strength ?? 1), value => {
      row.strength = clampNumber(value, -20, 20, 1); changed();
    }, { min: -20, max: 20, step: 0.01 }));
    mark(node.addWidget("toggle", "Schedule", !!row.schedule_enabled, value => {
      row.schedule_enabled = !!value; addNativeWidgetFallback(node, loraNames); changed();
    }));
    if (row.schedule_enabled) {
      mark(node.addWidget("number", "Start %", Number(row.start ?? 0), value => {
        row.start = clampNumber(value, 0, 100, 0); changed();
      }, { min: 0, max: 100, step: 0.1 }));
      mark(node.addWidget("number", "End %", Number(row.end ?? 100), value => {
        row.end = clampNumber(value, 0, 100, 100); changed();
      }, { min: 0, max: 100, step: 0.1 }));
    }
    mark(node.addWidget("button", `Remove LoRA ${index + 1}`, null, () => {
      rows.splice(index, 1); addNativeWidgetFallback(node, loraNames); changed();
    }));
  });
  node.setSize?.([Math.max(node.size?.[0] || 300, 300), node.computeSize?.()[1] || node.size?.[1] || 200]);
  node.setDirtyCanvas(true, true);
}

function installNodeUI(node) {
  if (!isTargetNode(node) || node._xeLoraScheduleInstalled) return;
  node._xeLoraScheduleInstalled = true;
  node.properties ||= {};
  readState(node);
  installScheduleStyles();
  const root = document.createElement("div");
  root.className = "xe-lora-schedule";
  root.style.cssText = "color:var(--fg-color,#ddd);padding:4px;";
  const list = document.createElement("div");
  const add = document.createElement("button");
  add.className = "xe-lora-schedule__add";
  add.textContent = "+ Add LoRA";
  add.style.cssText = "display:block;width:calc(100% - 30px);height:25px;margin:3px auto 0;";
  root.append(list, add);
  const widgetHeight = () => Math.min(470, Math.max(90, list.scrollHeight + 48));

  try {
    if (typeof node.addDOMWidget !== "function") throw new Error("DOM widgets are unavailable in this ComfyUI frontend");
    const widget = node.addDOMWidget("lora_schedule_ui", "xe_lion_lora_schedule", root, {
      serialize: false,
      getValue: () => readState(node),
      setValue: () => {},
      getMinHeight: widgetHeight,
      getMaxHeight: widgetHeight,
      margin: 4,
    });
    widget.computeLayoutSize = () => ({ minHeight: widgetHeight(), minWidth: 1 });
  } catch (error) {
    console.warn("[Multi LoRA Schedule] Falling back to native widgets:", error);
    fetchLoras().then(names => addNativeWidgetFallback(node, names));
    return;
  }

  // Paint the controls before making a network request. This mirrors Pixaroma's
  // LoRA Loader, whose picker is populated asynchronously but whose Add button
  // and empty state are available immediately.
  populateNode(node, root, list, add, []);
  fetchLoras().then(names => {
    if (node._xeLoraScheduleInstalled) populateNode(node, root, list, add, names);
  });
}

async function fetchLoras() {
  try {
    const response = await fetch(new URL("/lora_schedule/loras", window.location.origin));
    if (response.ok) return await response.json();
  } catch (error) {
    console.warn("[Multi LoRA Schedule] Could not fetch LoRA list", error);
  }
  return [];
}

function populateNode(node, root, list, add, loraNames) {
  // Render the same compact row UI for either ComfyUI renderer.
  const rows = readState(node);
  const widget = node.widgets?.find(item => item.name === "lora_schedule_ui");
  if (widget) node._xeLoraScheduleWidget = widget;
  const changed = () => {
    node.properties.loras = readState(node);
    node.setDirtyCanvas(true, true);
    app.graph?.setDirtyCanvas(true, true);
  };
  const field = (label, value, min, max, step, onChange) => {
    const wrap = document.createElement("label");
    wrap.classList.add("xe-lora-schedule__field");
    wrap.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap;";
    const text = document.createElement("span"); text.textContent = label;
    const input = document.createElement("input"); input.type = "number"; input.value = value;
    input.min = min; input.max = max; input.step = step;
    input.style.cssText = "width:65px;min-width:45px;";
    input.addEventListener("change", () => onChange(input.value));
    wrap.append(text, input); return wrap;
  };
  const render = () => {
    list.replaceChildren();
    rows.forEach((row, index) => {
      const panel = document.createElement("div");
      panel.classList.add("xe-lora-schedule__row");
      panel.style.cssText = "border:1px solid #555;border-radius:5px;padding:6px;margin:4px 0;";
      const header = document.createElement("div");
      header.style.cssText = "display:flex;gap:5px;align-items:center;margin-bottom:5px;";
      const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.checked = row.enabled !== false;
      toggle.title = "Enable this LoRA"; toggle.onchange = () => { row.enabled = toggle.checked; changed(); };
      const picker = document.createElement("select"); picker.style.cssText = "flex:1;min-width:0;";
      const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Select LoRA"; picker.append(empty);
      for (const name of loraNames) { const option = document.createElement("option"); option.value = name; option.textContent = name; picker.append(option); }
      if (row.name && !loraNames.includes(row.name)) { const missing = document.createElement("option"); missing.value = row.name; missing.textContent = `${row.name} (missing)`; picker.append(missing); }
      picker.value = row.name || ""; picker.onchange = () => { row.name = picker.value; changed(); };
      const remove = document.createElement("button"); remove.textContent = "×"; remove.title = "Remove this LoRA";
      remove.className = "xe-lora-schedule__remove";
      remove.style.cssText = "min-width:26px;padding:2px 6px;";
      remove.onclick = () => { rows.splice(index, 1); render(); changed(); };
      header.append(toggle, picker, remove);
      const settings = document.createElement("div"); settings.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;";
      settings.append(field("Strength", row.strength ?? 1, -20, 20, 0.01, value => { row.strength = clampNumber(value, -20, 20, 1); changed(); }));
      const scheduleLabel = document.createElement("label"); scheduleLabel.style.cssText = "display:flex;align-items:center;gap:4px;";
      const schedule = document.createElement("input"); schedule.type = "checkbox"; schedule.checked = !!row.schedule_enabled;
      schedule.onchange = () => { row.schedule_enabled = schedule.checked; render(); changed(); };
      scheduleLabel.append(schedule, document.createTextNode("Schedule")); settings.append(scheduleLabel);
      panel.append(header, settings);
      if (row.schedule_enabled) {
        const range = document.createElement("div"); range.style.cssText = "display:flex;gap:10px;align-items:center;margin:6px 0 0 22px;";
        range.append(field("Start %", row.start ?? 0, 0, 100, 0.1, value => { row.start = clampNumber(value, 0, 100, 0); changed(); }));
        range.append(field("End %", row.end ?? 100, 0, 100, 0.1, value => { row.end = clampNumber(value, 0, 100, 100); changed(); }));
        panel.append(range);
      }
      list.append(panel);
    });
    node.setSize?.([Math.max(node.size?.[0] || 300, 300), Math.min(470, Math.max(90, list.scrollHeight + 48))]);
    node.setDirtyCanvas(true, true);
  };
  add.onclick = () => { rows.push(DEFAULT_ROW()); render(); changed(); };
  node._xeLoraScheduleRender = render;
  render();
}

app.registerExtension({
  name: "xe-lion.multi-lora-schedule",
  nodeCreated(node) { installNodeUI(node); },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== CLASS) return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function (...args) {
      const result = originalCreated?.apply(this, args);
      installNodeUI(this);
      return result;
    };
    const originalConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (...args) {
      const result = originalConfigure?.apply(this, args);
      queueMicrotask(() => this._xeLoraScheduleRender?.());
      return result;
    };
  },
});

const originalGraphToPrompt = app.graphToPrompt;
app.graphToPrompt = async function (...args) {
  const result = await originalGraphToPrompt.apply(this, args);
  const output = result?.output;
  if (!output) return result;
  const nodes = new Map((app.graph?._nodes || []).map(node => [String(node.id), node]));
  for (const [id, entry] of Object.entries(output)) {
    if (entry?.class_type !== CLASS) continue;
    const node = nodes.get(String(id));
    const rows = (node?.properties?.loras || []).map(row => ({
      name: row.name || "", enabled: row.enabled !== false,
      strength: Number(row.strength ?? 1), schedule_enabled: !!row.schedule_enabled,
      start: Number(row.start ?? 0), end: Number(row.end ?? 100),
    }));
    entry.inputs ||= {};
    entry.inputs.lora_schedule_state = JSON.stringify({ loras: rows });
  }
  return result;
};
