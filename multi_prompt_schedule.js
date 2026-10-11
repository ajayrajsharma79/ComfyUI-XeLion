import { app } from "../../scripts/app.js";

const CLASS = "MultiPromptSchedule";
const STATE_KEY = "prompts";
const STEP = 0.001;
const MAX_RANGE = 1.0;
const DEFAULT_ROW = () => ({ text: "", end: 1.0 });

function readRows(node) {
  node.properties ||= {};
  if (!Array.isArray(node.properties[STATE_KEY])) node.properties[STATE_KEY] = [];
  return node.properties[STATE_KEY];
}

function asRange(value, fallback = MAX_RANGE) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_RANGE, Math.max(0, Math.round(n * 1000) / 1000));
}

function isTargetNode(node) {
  return node?.comfyClass === CLASS || node?.type === CLASS || node?.constructor?.comfyClass === CLASS;
}

function installStyles() {
  if (document.getElementById("xe-multi-prompt-styles")) return;
  const style = document.createElement("style");
  style.id = "xe-multi-prompt-styles";
  style.textContent = `
    .xe-multi-prompt textarea { display:block; width:100%; min-height:54px; box-sizing:border-box;
      resize:vertical; padding:6px 8px; color:#f0f0f0; background:#171717; border:1px solid #414141;
      border-radius:4px; font:inherit; font-size:11px; line-height:1.4; }
    .xe-multi-prompt textarea:focus, .xe-multi-prompt input[type="number"]:focus { outline:none; border-color:#e87522; }
    .xe-multi-prompt__row { border:1px solid #414141; border-radius:5px; background:rgba(255,255,255,.035); padding:6px; margin:4px 0; }
    .xe-multi-prompt__header { display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; color:#c8c8c8; font-size:11px; font-weight:600; }
    .xe-multi-prompt__range { display:flex; align-items:center; gap:6px; margin-top:5px; color:#c8c8c8; font-size:11px; font-variant-numeric:tabular-nums; }
    .xe-multi-prompt__range input { width:72px; min-height:24px; box-sizing:border-box; padding:2px 5px;
      color:#f0f0f0; background:#171717; border:1px solid #414141; border-radius:4px; font:inherit; font-size:11px; }
    .xe-multi-prompt__remove { min-width:24px; padding:2px 6px; color:#d9d9d9; background:transparent;
      border:1px solid #494949; border-radius:4px; font:inherit; cursor:pointer; }
    .xe-multi-prompt__remove:hover { border-color:#888; filter:brightness(1.12); }
    .xe-multi-prompt__empty { padding:12px 8px; color:#999; text-align:center; font-size:11px; }
    .xe-multi-prompt .xe-lora-schedule__add { color:#fff; background:#e87522; font-weight:600;
      border:1px solid #f18a3b; border-radius:5px; cursor:pointer; }
    .xe-multi-prompt .xe-lora-schedule__add:hover { background:#f1842b; border-color:#ffa04d; }
  `;
  document.head.appendChild(style);
}

function installNodeUI(node) {
  if (!isTargetNode(node) || node._xeMultiPromptInstalled) return;
  node._xeMultiPromptInstalled = true;
  installStyles();
  let rows = readRows(node);
  const root = document.createElement("div");
  root.className = "xe-lora-schedule xe-multi-prompt";
  root.style.cssText = "padding:4px;color:var(--fg-color,#ddd);font-family:Inter,\"Segoe UI\",system-ui,sans-serif;font-size:12px;line-height:1.35;max-height:540px;overflow:auto;";
  const list = document.createElement("div");
  const add = document.createElement("button");
  add.className = "xe-lora-schedule__add";
  add.textContent = "+ Add Prompt";
  add.style.cssText = "display:block;width:calc(100% - 30px);height:25px;margin:3px auto 0;";
  root.append(list, add);

  const widgetHeight = () => Math.min(600, Math.max(64, list.scrollHeight + 48));
  try {
    const widget = node.addDOMWidget("prompt_schedule_ui", "xe_multi_prompt_schedule", root, {
      serialize: false,
      getValue: () => readRows(node),
      setValue: () => {},
      getMinHeight: widgetHeight,
      getMaxHeight: widgetHeight,
      margin: 4,
    });
    widget.computeLayoutSize = () => ({ minHeight: widgetHeight(), minWidth: 1 });
  } catch (error) {
    console.warn("[Multi Prompt Scheduler] DOM widgets are unavailable:", error);
    return;
  }

  const setDirty = () => {
    node.properties[STATE_KEY] = rows;
    node.setDirtyCanvas(true, true);
    app.graph?.setDirtyCanvas(true, true);
  };
  const render = () => {
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "xe-multi-prompt__empty";
      empty.textContent = "No prompts yet — add a prompt to begin.";
      list.append(empty);
    }

    let start = 0;
    rows.forEach((row, index) => {
      const rowStart = start;
      const end = asRange(row.end);
      const panel = document.createElement("div");
      panel.className = "xe-multi-prompt__row";

      const header = document.createElement("div");
      header.className = "xe-multi-prompt__header";
      const title = document.createElement("span");
      title.textContent = `Prompt ${index + 1}`;
      const remove = document.createElement("button");
      remove.className = "xe-multi-prompt__remove";
      remove.textContent = "×";
      remove.title = `Remove Prompt ${index + 1}`;
      remove.onclick = () => { rows.splice(index, 1); render(); setDirty(); };
      header.append(title, remove);

      const textarea = document.createElement("textarea");
      textarea.value = row.text || "";
      textarea.placeholder = "Enter prompt text…";
      textarea.oninput = () => { row.text = textarea.value; setDirty(); };

      const range = document.createElement("div");
      range.className = "xe-multi-prompt__range";
      const startText = document.createElement("span");
      startText.textContent = `Start ${rowStart.toFixed(3)}  →  End`;
      const endInput = document.createElement("input");
      endInput.type = "number";
      endInput.min = (rowStart + STEP).toFixed(3);
      endInput.max = (index < rows.length - 1 ? asRange(rows[index + 1].end) - STEP : MAX_RANGE).toFixed(3);
      endInput.step = STEP.toFixed(3);
      endInput.value = end.toFixed(3);
      endInput.title = "End of this prompt's sampling range. The next prompt starts here.";
      endInput.onchange = () => {
        const min = rowStart + STEP;
        const max = index < rows.length - 1 ? asRange(rows[index + 1].end) - STEP : MAX_RANGE;
        if (max < min) return;
        const value = Number(endInput.value);
        row.end = asRange(Math.min(max, Math.max(min, Number.isFinite(value) ? value : end)));
        render();
        setDirty();
      };
      range.append(startText, endInput);
      panel.append(header, textarea, range);
      list.append(panel);
      start = end;
    });

    const lastEnd = rows.length ? asRange(rows[rows.length - 1].end) : 0;
    const canAdd = lastEnd < MAX_RANGE - 1e-9;
    add.disabled = !canAdd;
    add.title = canAdd ? "Add a prompt for the remaining sampling range" : "The current prompts already use the full 0.000–1.000 range. Shorten the last range to add another.";
    node.setSize?.([Math.max(320, node.size?.[0] || 0), Math.min(600, Math.max(140, list.scrollHeight + 64))]);
    node.setDirtyCanvas(true, true);
  };

  add.onclick = () => {
    const start = rows.length ? asRange(rows[rows.length - 1].end) : 0;
    if (start >= MAX_RANGE - 1e-9) return;
    rows.push({ ...DEFAULT_ROW(), end: MAX_RANGE });
    render();
    setDirty();
  };
  node._xeMultiPromptSetRows = value => { rows = value; };
  node._xeMultiPromptRender = render;
  render();
}

app.registerExtension({
  name: "xe-lion.multi-prompt-schedule",
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
      // LiteGraph invokes onConfigure while restoring a saved workflow. Read
      // the saved rows explicitly, then update the array used by the UI handlers.
      const saved = args[0]?.properties?.[STATE_KEY] ?? args[0]?.multi_prompt_schedule?.[STATE_KEY];
      if (Array.isArray(saved)) {
        this.properties ||= {};
        this.properties[STATE_KEY] = saved.map(row => ({
          text: String(row?.text || ""),
          end: asRange(row?.end),
        }));
      }
      queueMicrotask(() => {
        if (Array.isArray(this.properties?.[STATE_KEY])) {
          this._xeMultiPromptSetRows?.(this.properties[STATE_KEY]);
        }
        this._xeMultiPromptRender?.();
      });
      return result;
    };
    const originalSerialize = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function (data, ...args) {
      const result = originalSerialize?.call(this, data, ...args);
      data.properties ||= {};
      data.properties[STATE_KEY] = (this.properties?.[STATE_KEY] || []).map(row => ({
        text: String(row?.text || ""),
        end: asRange(row?.end),
      }));
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
    const prompts = (node?.properties?.[STATE_KEY] || []).map(row => ({
      text: String(row.text || ""),
      end: asRange(row.end),
    }));
    entry.inputs ||= {};
    entry.inputs.prompt_schedule_state = JSON.stringify({ prompts });
  }
  return result;
};
