// BF6 Extended Variable Manager
(function () {
  const PLUGIN_ID = "bf-portal-extended-variable-manager";

  // defensive plugin handle
  let plugin = null;
  try {
    if (typeof BF2042Portal !== "undefined" && BF2042Portal.Plugins?.getPlugin) {
      plugin = BF2042Portal.Plugins.getPlugin(PLUGIN_ID) || { id: PLUGIN_ID };
    } else {
      plugin = { id: PLUGIN_ID };
    }
  } catch (e) { plugin = { id: PLUGIN_ID }; }

  // categories
  const DEFAULT_CATEGORIES = [
    "Global", "AreaTrigger", "CapturePoint", "EmplacementSpawner", "HQ", "InteractPoint", "LootSpawner", "MCOM",
    "Player", "RingOfFire", "ScreenEffect", "Sector", "SFX", "SpatialObject", "Spawner", "SpawnPoint", "Team",
    "Vehicle", "VehicleSpawner", "VFX", "VO", "WaypointPath", "WorldIcon"
  ];

  const STORAGE_KEY_CATS = "bf-portal-extvars-cat-order";

  // 保存された順序を読み込む
  function loadCategoryOrder() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CATS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const ordered = parsed.filter(c => DEFAULT_CATEGORIES.includes(c));
          DEFAULT_CATEGORIES.forEach(c => {
            if (!ordered.includes(c)) ordered.push(c);
          });
          //console.log("[ExtVars][CatOrder] ストレージから順序を読み込みました:", ordered);
          return ordered;
        }
      }
    } catch (e) {
      //console.warn("[ExtVars][CatOrder] 読み込み失敗:", e);
    }
    //console.log("[ExtVars][CatOrder] デフォルト順序を使用します");
    return [...DEFAULT_CATEGORIES];
  }

  // カテゴリ順序を保存する
  function saveCategoryOrder(order) {
    try {
      localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(order));
      //console.log("[ExtVars][CatOrder] ストレージに順序を保存しました:", order);
    } catch (e) {
      //console.warn("[ExtVars][CatOrder] 保存失敗:", e);
    }
  }

  let CATEGORIES = loadCategoryOrder();

  // ---------- workspace helpers ----------
  function getMainWorkspaceSafe() {
    try {
      if (typeof _Blockly !== "undefined" && _Blockly.getMainWorkspace) return _Blockly.getMainWorkspace();
      if (typeof Blockly !== "undefined" && Blockly.getMainWorkspace) return Blockly.getMainWorkspace();
      if (typeof BF2042Portal !== "undefined" && BF2042Portal.getMainWorkspace) {
        try { return BF2042Portal.getMainWorkspace(); } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function workspaceGetVariableMap(ws) {
    try {
      if (!ws) return null;
      if (ws.getVariableMap) return ws.getVariableMap();
      if (ws.variableMap) return ws.variableMap;
    } catch (e) {}
    return null;
  }

  function workspaceGetVariables(ws) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return [];
      if (map.getVariables) return map.getVariables();
      if (map.getAllVariables) return map.getAllVariables();
      if (Array.isArray(map.variables)) return map.variables;
    } catch (e) {}
    return [];
  }

  function getVarId(v) { try { return v?.id ?? (v.getId ? v.getId() : null); } catch (e) { return null; } }
  function getVarName(v) { try { return v?.name ?? (v.getName ? v.getName() : null); } catch(e) { return null; } }
  function getVarType(v) { try { return v?.type ?? (v.getType ? v.getType() : "Global"); } catch(e) { return "Global"; } }

  function createWorkspaceVariable(ws, name, type, id) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (map?.createVariable) return map.createVariable(name, type || "", id);
      if (ws?.createVariable) return ws.createVariable(name, type || "", id);
      if (Blockly?.Variables?.createVariable) return Blockly.Variables.createVariable(ws, name, type || "", id);
    } catch(e) { /*console.warn("[ExtVars] createWorkspaceVariable error:", e);*/ }
    return null;
  }

  function deleteWorkspaceVariable(ws, idOrName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      if (map.deleteVariableById) { try { map.deleteVariableById(idOrName); return true; } catch(e){} }
      if (map.deleteVariable) { try { map.deleteVariable(idOrName); return true; } catch(e){} }
      if (map.removeVariable) { try { map.removeVariable(idOrName); return true; } catch(e){} }
      if (map.getVariables) {
        const vs = map.getVariables();
        const idx = vs.findIndex(v => getVarId(v) === idOrName || getVarName(v) === idOrName);
        if (idx >= 0) { try { vs.splice(idx,1); return true; } catch(e){} }
      }
    } catch(e) { /*console.warn("[ExtVars] deleteWorkspaceVariable error:", e); */}
    return false;
  }

  function renameWorkspaceVariable(ws, varObj, newName) {
    try {
      const map = workspaceGetVariableMap(ws);
      if (!map) return false;
      let found = null;
      const id = getVarId(varObj);
      if (id && map.getVariableById) { try { found = map.getVariableById(id); } catch(e){found=null;} }
      if (!found && map.getVariable) { try { found = map.getVariable(id) || map.getVariable(getVarName(varObj)); } catch(e){found=null;} }
      if (found) { try { found.name = newName; return true; } catch(e){} }
      if (varObj?.name !== undefined) { varObj.name = newName; return true; }
    } catch(e) { /*console.warn("[ExtVars] renameWorkspaceVariable error:", e);*/ }
    return false;
  }

  // ---------- update blocks after rename ----------
  function updateBlocksForVariableRename(oldName, newName, ws) {
    if (!ws) return;

    const allBlocks = ws.getAllBlocks(false);
    let changed = 0;

    allBlocks.forEach(block => {
        if (!block) return;

        const varField = block.getField && block.getField("VAR");
        if (!varField) return;

        try {
            const val = varField.getValue?.();            // variable ID
            const varObj = ws.getVariableById?.(val);     // lookup variable from ID

            if (varObj && varObj.name === newName) {
                varField.setValue(val);
                block.render?.();
                changed++;
            }
        } catch (e) {
            //console.warn("[ExtVars] Block update error:", e);
        }
    });

    //console.log(`[ExtVars] Rename complete: ${changed} blocks updated.`);

    try {
        const dummyName = "__EXTVARS_DUMMY__";
        const dummyId = "EXTVARS_DUMMY_" + Date.now();

        const dummyVar = createWorkspaceVariable(ws, dummyName, "Global", dummyId);

        if (dummyVar) {
            deleteWorkspaceVariable(ws, dummyId) || deleteWorkspaceVariable(ws, dummyName);
        }

        //console.log("[ExtVars] Dummy variable added & deleted to trigger save.");
    } catch (e) {
        //console.warn("[ExtVars] Dummy variable trick failed:", e);
    }
  }

function createID(length = 20) {
  // SAFE character set (no symbols)
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-+%@^!=";

  function generateId() {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  try {
    const ws = getMainWorkspaceSafe();
    const vars = workspaceGetVariables(ws);

    const existingIds = new Set(
      vars.map(v => getVarId(v)).filter(id => typeof id === "string")
    );

    let newId;
    do {
      newId = generateId();
    } while (existingIds.has(newId));

    return newId;

  } catch (e) {
    return generateId();
  }
}

  // ---------- live registry ----------
  function getLiveRegistry() {
    const ws = getMainWorkspaceSafe();
    const live = {};
    for (const c of CATEGORIES) live[c]=[];
    try {
      const vars = workspaceGetVariables(ws);
      for (const v of vars) {
        const id = getVarId(v);
        const name = getVarName(v);
        const type = getVarType(v) || "Global";
        const cat = (typeof type==="string") ? type : "Global";
        if (!live[cat]) live[cat]=[];
        live[cat].push({ id, name, type, _raw:v });
      }
    } catch(e){}
    return live;
  }

  // ---------- check nested ----------
  function isNestedInside(block, parent) {
    if (!parent || !parent.inputList) return false;
    for (const input of parent.inputList) {
      if (!input.connection) continue;
      const target = input.connection.targetBlock_;
      if (!target) continue;
      if (target === block) return true;
    }
    return false;
  }

  // ---------- COUNT USAGE ----------
  function countVariableUsage(ws, varDef) {
    if (!ws || !varDef) return 0;
    const allBlocks = ws.getAllBlocks ? ws.getAllBlocks() : [];
    const targetId = getVarId(varDef);
    let count = 0;

    //console.log("=====================================================");
    //console.log(`[ExtVars] FULL DEBUG START for variable: "${getVarName(varDef)}" (type: ${getVarType(varDef)})`);
    //console.log("=====================================================");

    for (const block of allBlocks) {
        if (!block) continue;

        const varField = block.getField && block.getField("VAR");
        if (!varField) continue;

        try {
            const val = varField.getValue?.();
            if (val === targetId) {
                let nested = false;
                for (const parent of allBlocks) {
                    if (parent === block) continue;
                    if (isNestedInside(block, parent)) { nested = true; break; }
                }
                if (!nested) {
                    count++;
                    //console.log(`• COUNTED block: ${block.type} (id=${block.id})`);
                } else {
                    //console.log(`• SKIPPED nested block: ${block.type} (id=${block.id})`);
                }
            }
        } catch (e) { /*console.warn("[ExtVars] Variable count check error:", e);*/ }
    }

    //console.log("=====================================================");
    //console.log(`[ExtVars] FINAL COUNT for "${getVarName(varDef)}": ${count}`);
    //console.log("=====================================================");

    return count;
  }

  // ---------- reorder variables in internal map ----------
  function reorderVariablesInMap(ws, cat, orderedIds) {
    const map = workspaceGetVariableMap(ws);
    //console.log("==============================================");
    //console.log("[ExtVars][Reorder] ENTER for category:", cat);

    if (!map) {
        //console.warn("[ExtVars][Reorder] No variable map");
        return;
    }

    // Portal fork: variables are stored in a Map called `variableMap`
    const vm = map.variableMap;
    if (!vm || typeof vm.get !== "function") {
        //console.warn("[ExtVars][Reorder] variableMap is not a Map:", vm);
        return;
    }

    const raw = vm.get(cat);
    //console.log("[ExtVars][Reorder] raw array for", cat, "=", raw);

    if (!Array.isArray(raw)) {
        //console.warn("[ExtVars][Reorder] No raw array for category:", cat, "raw:", raw);
        //console.log("==============================================");
        return;
    }

    //console.log("[ExtVars][Reorder] BEFORE:", raw.map(v => getVarId(v)));

    const newArr = [];

    for (const id of orderedIds) {
        const v = raw.find(x => getVarId(x) === id);
        if (v) newArr.push(v);
    }

    for (const v of raw) {
        if (!newArr.includes(v)) newArr.push(v);
    }

    //console.log("[ExtVars][Reorder] AFTER:", newArr.map(v => getVarId(v)));

    // Write back into the Map
    vm.set(cat, newArr);

    // Force Portal to detect a change (same trick used in rename)
try {
    const dummyName = "__EXTVARS_ORDER_DUMMY__";
    const dummyId = "EXTVARS_ORDER_DUMMY_" + Date.now();

    const dummyVar = createWorkspaceVariable(ws, dummyName, "Global", dummyId);

    if (dummyVar) {
        deleteWorkspaceVariable(ws, dummyId) || deleteWorkspaceVariable(ws, dummyName);
    }

    //console.log("[ExtVars][Reorder] Dummy variable added & removed to trigger save.");
} catch (e) {
    //console.warn("[ExtVars][Reorder] Dummy variable trick failed:", e);
}

    //console.log("[ExtVars][Reorder] WRITE COMPLETE");
    //console.log("==============================================");
}

  // ---------- inject CSS ----------
  (function injectStyle(){
    const style = document.createElement("style");
    style.textContent = `
      .ev-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999999}
      .ev-modal{width:min(1100px,94vw);height:min(760px,90vh);background:#1e1e1e;border-radius:10px;padding:14px;display:flex;flex-direction:column;color:#e9eef2;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,0.75)}
      .ev-content{display:flex;gap:12px;flex:1;overflow:hidden}
      .ev-cats{width:240px;background:#000000;border-radius:8px;padding:10px;overflow-y:auto}
      .ev-cat{padding:8px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:#171717;color:#e9eef2;margin-bottom:6px;transition:background 0.15s ease,transform 0.15s ease}
      .ev-cat:hover{background:#434343;transform:translateX(1px)}
      .ev-cat.selected{background:#6e0000;border-left:4px solid #ff0a03}
      .ev-list{flex:1;background:#000000;border-radius:8px;padding:10px;overflow:auto;display:flex;flex-direction:column}
      .ev-row{display:flex;justify-content:space-between;align-items:center;padding:8px;background:#171717;border-radius:6px;margin-bottom:8px;transition:transform 0.15s ease,box-shadow 0.15s ease,background 0.15s ease}
      .ev-row.dragging{opacity:0.9;background:#252525;box-shadow:0 8px 24px rgba(0,0,0,0.6);transform:scale(1.01)}
      .ev-btn{padding:6px 10px;border-radius:6px;border:none;color:#fff;cursor:pointer}
      .ev-add{background:#008a00}
      .ev-edit{background:#3a3a3a}
      .ev-del{background:#8a0000}
      .ev-muted{color:#cdcdcd;font-size:14px}
      .ev-details{width:320px;background:#121214;border-radius:8px;padding:10px;overflow:auto}
      .ev-input{width:100%;padding:8px;border-radius:6px;border:1px solid #222;background:#0b0b0c;color:#e9eef2;margin-bottom:8px}
      .ev-actions{display:flex;justify-content:flex-end;margin-top:10px;gap:8px}
      .ev-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      .ev-title{font-weight:700;font-size:24px}

      .ev-row-left{display:flex;align-items:center;gap:8px}
      .ev-drag-handle{width:16px;height:16px;cursor:grab;display:flex;align-items:center;justify-content:center;color:#aaaaaa;font-size:14px;flex-shrink:0;user-select:none}
      .ev-drag-handle::before{content:"⋮⋮";line-height:1}
      .ev-row.dragging .ev-drag-handle{cursor:grabbing;color:#ffffff}
       .ev-cat{user-select:none;position:relative}
      .ev-cat.dragging{opacity:0.4;background:#333}
      .ev-cat-left{display:flex;align-items:center;gap:8px}
      .ev-sort-btn{background:#2a2a2a;border:1px solid #444;font-size:12px;padding:3px 8px;margin-left:8px;border-radius:4px;cursor:pointer}
      .ev-sort-btn:hover{background:#3a3a3a}
      .ev-prompt-popover{position:fixed;background:#222;border:1px solid #444;border-radius:6px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,0.8);z-index:1000000;display:flex;flex-direction:column;gap:8px;width:320px}
      .ev-prompt-input{width:100%;padding:6px 8px;border-radius:4px;border:1px solid #555;background:#111;color:#fff;font-size:18px;box-sizing:border-box;outline:none}
      .ev-prompt-input:focus{border-color:#008a00}
      .ev-prompt-btns{display:flex;justify-content:flex-end;gap:6px}
    `;
    document.head.appendChild(style);
  })();

  // ---------- modal ----------
  
  let modalOverlay = null;
  function removeModal() { if (modalOverlay) { try { modalOverlay.remove(); } catch (e) { } modalOverlay = null; } }

  // 独自入力ポップアップの表示ヘルパー
  let currentPrompt = null;
  function removePrompt() {
    if (currentPrompt) {
      try { currentPrompt.remove(); } catch (e) { }
      currentPrompt = null;
    }
  }

  function showInlinePrompt(x, y, initialValue, onConfirm) {
    removePrompt();

    const pop = document.createElement("div");
    pop.className = "ev-prompt-popover";

    // 入力欄 [                     ]
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ev-prompt-input";
    input.value = initialValue || "";

    // ボタン欄 [OK][CANCEL]
    const btnRow = document.createElement("div");
    btnRow.className = "ev-prompt-btns";

    const okBtn = document.createElement("button");
    okBtn.className = "ev-btn ev-add";
    okBtn.innerText = "OK";
    okBtn.style.padding = "4px 10px";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ev-btn ev-edit";
    cancelBtn.innerText = "CANCEL";
    cancelBtn.style.padding = "4px 10px";

    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);

    pop.appendChild(input);
    pop.appendChild(btnRow);
    document.body.appendChild(pop);
    currentPrompt = pop;

    // マウスカーソルの左側に配置 (画面外にはみ出ないよう調整)
    const popWidth = 330;
    let leftPos = x - popWidth - 10;
    if (leftPos < 10) leftPos = x + 15; // 画面左端を超えるなら右側に表示
    let topPos = y - 20;
    if (topPos + 90 > window.innerHeight) topPos = window.innerHeight - 95;

    pop.style.left = `${leftPos}px`;
    pop.style.top = `${topPos}px`;

    // フォーカス＆全選択（上書き・編集を即座にしやすくする）
    input.focus();
    input.select();

    // アクション処理
    const doConfirm = () => {
      const val = input.value.trim();
      if (val) {
        removePrompt();
        onConfirm(val);
      }
    };

    okBtn.onclick = (e) => { e.stopPropagation(); doConfirm(); };
    cancelBtn.onclick = (e) => { e.stopPropagation(); removePrompt(); };

    input.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); doConfirm(); }
      else if (e.key === "Escape") { e.preventDefault(); removePrompt(); }
    };

    // ポップアップ外をクリックしたら閉じる
    setTimeout(() => {
      const outsideClick = (e) => {
        if (!pop.contains(e.target)) {
          removePrompt();
          document.removeEventListener("mousedown", outsideClick);
        }
      };
      document.addEventListener("mousedown", outsideClick);
    }, 50);
  }

  function openModal() {
    removeModal();
    removePrompt();
    CATEGORIES = loadCategoryOrder(); // 起動時に最新の順序を復元
    const ws = getMainWorkspaceSafe();
    const live = getLiveRegistry();

    modalOverlay = document.createElement("div");
    modalOverlay.className = "ev-overlay";
    const modal = document.createElement("div");
    modal.className = "ev-modal";
    modalOverlay.appendChild(modal);

    const top = document.createElement("div");
    top.className = "ev-top";
    const title = document.createElement("div");
    title.className = "ev-title";
    title.innerText = "Advanced Variable Manager";
    top.appendChild(title);

    const topActions = document.createElement("div");
    const closeBtn = document.createElement("button");
    closeBtn.className = "ev-btn ev-del";
    closeBtn.innerText = "Close";
    closeBtn.onclick = () => removeModal();
    topActions.appendChild(closeBtn);
    top.appendChild(topActions);
    modal.appendChild(top);

    const content = document.createElement("div");
    content.className = "ev-content";
    modal.appendChild(content);

    const left = document.createElement("div");
    left.className = "ev-cats";
    const center = document.createElement("div");
    center.className = "ev-list";

    content.appendChild(left);
    content.appendChild(center);

    let currentCategory = CATEGORIES[0] || "Global";

    // モーダル起動時の初期順序(DEF)を記録
    const defaultOrderMap = {};
    for (const c of CATEGORIES) {
      defaultOrderMap[c] = (live[c] || []).map(v => v.id);
    }
    let sortMode = "def"; // "def" | "asc" | "desc"

    // ==========================================
    // 左側：カテゴリ一覧のドラッグ並び替え
    // ==========================================
    function initCatDnD() {
      left.ondragover = (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        const dragging = left.querySelector(".ev-cat.dragging");
        if (!dragging) return;
        const cats = [...left.querySelectorAll(".ev-cat:not(.dragging)")];
        const after = cats.find(c => ev.clientY <= c.getBoundingClientRect().top + c.offsetHeight / 2);
        if (after) left.insertBefore(dragging, after);
        else left.appendChild(dragging);
      };

      left.ondrop = (ev) => {
        ev.preventDefault();
        const domCats = [...left.querySelectorAll(".ev-cat")].map(c => c.dataset.catName).filter(Boolean);
        if (domCats.length > 0) {
          CATEGORIES = domCats;
          saveCategoryOrder(CATEGORIES);
        }
        rebuildCategories();
      };
    }

    // ==========================================
    // 左側：カテゴリ一覧の再描画
    // ==========================================
    function rebuildCategories() {
      left.innerHTML = "";
      const fresh = getLiveRegistry();
      Object.assign(live, fresh);
      initCatDnD();

      for (const cat of CATEGORIES) {
        const el = document.createElement("div");
        el.className = "ev-cat";
        el.dataset.catName = cat;
        if (cat === currentCategory) el.classList.add("selected");

        const count = (live[cat] || []).length;

        // タグ（ドラッグハンドル）＋カテゴリ名
        const leftWrap = document.createElement("div");
        leftWrap.className = "ev-cat-left";

        const handle = document.createElement("div");
        handle.className = "ev-drag-handle";
        handle.title = "ドラッグしてグループ順を移動";

        const nameSpan = document.createElement("span");
        nameSpan.style.fontWeight = "600";
        nameSpan.innerText = cat;

        leftWrap.appendChild(handle);
        leftWrap.appendChild(nameSpan);

        const countSpan = document.createElement("span");
        countSpan.className = "ev-muted";
        countSpan.innerText = count;

        el.appendChild(leftWrap);
        el.appendChild(countSpan);

        // カテゴリ切り替えクリック
        el.onclick = (e) => {
          if (e.target === handle) return;
          currentCategory = cat;
          sortMode = "def";
          rebuildCategories();
          rebuildList();
        };

        // ドラッグ処理
        handle.onmousedown = () => { el.setAttribute("draggable", "true"); };
        handle.onmouseup = () => { el.removeAttribute("draggable"); };

        el.ondragstart = (ev) => {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", cat);
          el.classList.add("dragging");
        };

        el.ondragend = () => {
          el.classList.remove("dragging");
          el.removeAttribute("draggable");
        };

        left.appendChild(el);
      }
    }

    // ==========================================
    // 右側：変数のドラッグ移動
    // ==========================================
    function initDnDIfNeeded() {
      center.ondragover = (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        const dragging = center.querySelector(".ev-row.dragging");
        if (!dragging) return;
        const rows = [...center.querySelectorAll(".ev-row:not(.dragging)")];
        const after = rows.find(r => ev.clientY <= r.getBoundingClientRect().top + r.offsetHeight / 2);
        if (after) center.insertBefore(dragging, after);
        else center.appendChild(dragging);
      };

      center.ondrop = (ev) => {
        ev.preventDefault();
        const newOrder = [...center.querySelectorAll(".ev-row")].map(r => r.dataset.varId);
        defaultOrderMap[currentCategory] = [...newOrder];
        sortMode = "def";
        reorderVariablesInMap(ws, currentCategory, newOrder);
        rebuildCategories();
        rebuildList();
      };
    }

    // ==========================================
    // 右側：変数一覧の再描画
    // ==========================================
    function rebuildList() {
      const fresh = getLiveRegistry();
      Object.assign(live, fresh);
      center.innerHTML = "";
      initDnDIfNeeded();

      // ★ スクロールしても常に最上部に固定されるヘッダー
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.position = "sticky";
      header.style.top = "-10px";           // 上端にピッタリ固定
      header.style.background = "#000000";   // スクロールした行が透けないように背景を黒に
      header.style.zIndex = "10";           // 変数行より手前に表示
      header.style.padding = "6px 0 10px 0";
      header.style.marginBottom = "4px";

      // 左側：タイトル ＋ 並び替えボタン
      const leftHeader = document.createElement("div");
      leftHeader.style.display = "flex";
      leftHeader.style.alignItems = "center";
      leftHeader.style.gap = "8px";

      const h = document.createElement("div");
      h.innerHTML = `<strong>${currentCategory} Variables</strong><span class="ev-muted"> Total: ${live[currentCategory]?.length || 0}</span>`;
      leftHeader.appendChild(h);

      // 並び替えボタン
      const sortBtn = document.createElement("button");
      sortBtn.className = "ev-btn";
      sortBtn.style.cssText = "background:#2b2b2b; border:1px solid #666; color:#fff; padding:3px 8px; font-size:12px; border-radius:4px; cursor:pointer;";

      if (sortMode === "asc") {
        sortBtn.innerText = " [ A → Z ]";
      } else if (sortMode === "desc") {
        sortBtn.innerText = " [ Z → A ]";
      } else {
        sortBtn.innerText = "[ DEF ]";
      }

      sortBtn.onclick = (e) => {
        e.stopPropagation();
        if (sortMode === "def") sortMode = "asc";
        else if (sortMode === "asc") sortMode = "desc";
        else sortMode = "def";
        console.log("[ExtVars] ソートモード:", sortMode);
        rebuildList();
      };
      leftHeader.appendChild(sortBtn);
      header.appendChild(leftHeader);

      // 右側：Addボタン
      const addBtn = document.createElement("button");
      addBtn.className = "ev-btn ev-add";
      addBtn.innerText = "Add";
      addBtn.onclick = (e) => {
        e.stopPropagation();
        showInlinePrompt(e.clientX, e.clientY, "", (name) => {
          const id = createID();
          createWorkspaceVariable(ws, name, currentCategory, id);
          if (!defaultOrderMap[currentCategory]) defaultOrderMap[currentCategory] = [];
          defaultOrderMap[currentCategory].push(id);
          rebuildCategories();
          rebuildList();
        });
      };
      header.appendChild(addBtn);
      center.appendChild(header);

      // 変数リストの取得
      let arr = [...(live[currentCategory] || [])];
      if (arr.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ev-muted";
        empty.innerText = "(no variables)";
        center.appendChild(empty);
        return;
      }

      // ソート処理
      if (sortMode === "asc") {
        arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      } else if (sortMode === "desc") {
        arr.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
      } else {
        const defIds = defaultOrderMap[currentCategory] || [];
        arr.sort((a, b) => {
          const idxA = defIds.indexOf(a.id);
          const idxB = defIds.indexOf(b.id);
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }

      // 各行の作成
      arr.forEach((v) => {
        const row = document.createElement("div");
        row.className = "ev-row";
        row.dataset.varId = v.id;

        const leftCol = document.createElement("div");
        leftCol.className = "ev-row-left";

        const dragHandle = document.createElement("div");
        dragHandle.className = "ev-drag-handle";

        const textCol = document.createElement("div");
        textCol.style.display = "flex";
        textCol.style.flexDirection = "column";

        const usedCount = countVariableUsage(ws, v);
        textCol.innerHTML = `<div style="font-weight:600">${v.name}</div><div class="ev-muted">In use: (${usedCount})</div>`;

        leftCol.appendChild(dragHandle);
        leftCol.appendChild(textCol);

        const rightCol = document.createElement("div");

        const editBtn = document.createElement("button");
        editBtn.className = "ev-btn ev-edit";
        editBtn.style.marginRight = "6px";
        editBtn.innerText = "Edit";
        editBtn.onclick = (e) => {
          e.stopPropagation();
          showInlinePrompt(e.clientX, e.clientY, v.name, (newName) => {
            const oldName = v.name;
            renameWorkspaceVariable(ws, v._raw, newName);
            updateBlocksForVariableRename(oldName, newName, ws);
            rebuildCategories();
            rebuildList();
          });
        };

        const delBtn = document.createElement("button");
        delBtn.className = "ev-btn ev-del";
        delBtn.innerText = "Delete";
        delBtn.onclick = () => {
          if (!confirm(`Delete variable "${v.name}"? This may break blocks referencing it.`)) return;
          deleteWorkspaceVariable(ws, v.id) || deleteWorkspaceVariable(ws, v.name);
          rebuildCategories();
          rebuildList();
        };

        rightCol.appendChild(editBtn);
        rightCol.appendChild(delBtn);

        row.appendChild(leftCol);
        row.appendChild(rightCol);
        center.appendChild(row);

        // 変数のDnDイベント
        dragHandle.onmousedown = () => { row.setAttribute("draggable", "true"); };
        dragHandle.onmouseup = () => { row.removeAttribute("draggable"); };

        row.ondragstart = (ev) => {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", v.id);
          row.classList.add("dragging");
        };

        row.ondragend = () => {
          row.classList.remove("dragging");
          row.removeAttribute("draggable");
        };
      });
    }

    rebuildCategories();
    rebuildList();
    modalOverlay.addEventListener("click", (ev) => { if (ev.target === modalOverlay) removeModal(); });
    document.body.appendChild(modalOverlay);
  }


  // ---------- context menu ----------
  function registerContextMenuItem(){
    try{
      const reg=(typeof _Blockly!=="undefined"&&_Blockly.ContextMenuRegistry?.registry)?_Blockly.ContextMenuRegistry.registry
               :(typeof Blockly!=="undefined"&&Blockly.ContextMenuRegistry?.registry)?Blockly.ContextMenuRegistry.registry:null;
      if(reg && typeof reg.register==="function"){
        const item={
          id:"manageExtendedVariables",
          displayText:"Manage Variables",
          preconditionFn:()=> "enabled",
          callback:()=>openModal(),
          scopeType:(typeof _Blockly!=="undefined"&&_Blockly.ContextMenuRegistry)?_Blockly.ContextMenuRegistry.ScopeType.WORKSPACE
                   :(typeof Blockly!=="undefined"&&Blockly.ContextMenuRegistry)?Blockly.ContextMenuRegistry.ScopeType.WORKSPACE:null,
          weight:98
        };
        try{ if(reg.getItem && reg.getItem(item.id)) reg.unregister(item.id); }catch(e){}
        reg.register(item); /*console.log("[ExtVars] Registered context menu item via ContextMenuRegistry");*/ return;
      }
    }catch(e){ /*console.warn("[ExtVars] ContextMenuRegistry registration failed:",e);*/ }

    (function domFallback(){
      document.addEventListener("contextmenu",()=>{
        setTimeout(()=>{
          const menu=document.querySelector(".context-menu, .bp-context-menu, .blocklyContextMenu"); if(!menu) return;
          if(menu.querySelector("[data-extvars]")) return;
          const el=document.createElement("div"); el.setAttribute("data-extvars","1"); el.style.padding="6px 10px"; el.style.cursor="pointer"; el.style.color="#e9eef2"; el.textContent="Manage Variables"; el.addEventListener("click",()=>{ openModal(); try{menu.style.display="none";}catch(e){} }); menu.appendChild(el);
        },40);
      });
    })();
  }

  function initialize(){ registerContextMenuItem(); if(plugin) plugin.openManager=openModal; /*console.info("[ExtVars] Live Extended Variable Manager initialized (workspace-only).");*/ }
  setTimeout(initialize,900);

  // ---------- safe export of console helpers ----------
  window._getMainWorkspaceSafe = getMainWorkspaceSafe;
  window._updateBlocksForVariableRename = updateBlocksForVariableRename;

})();
