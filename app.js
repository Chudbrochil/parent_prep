// ParentPrep — categorized packing lists with localStorage persistence.
//
// Storage shape (wrapped in an envelope so we can migrate safely):
//   { version: <int>, lists: { [listId]: { categories: [{name, items: [{text, checked}]}], isCustom?, name?, emoji?, description? } } }
//
// Never rename STORAGE_KEY again. Bump SCHEMA_VERSION and add a migration instead.

(function () {
  "use strict";

  // --- Constants -----------------------------------------------------

  const STORAGE_KEY = "parentprep.lists";
  const SCHEMA_VERSION = 1;
  const LEGACY_KEYS = ["parentprep.v5", "parentprep.v4", "parentprep.v3", "parentprep.v2", "parentprep.lists.v1"];

  const CUSTOM_CATEGORY = "My additions";
  const CUSTOM_DEFAULT_CATEGORY = "My items";

  const MAX_ITEM_TEXT_LENGTH = 200;
  const MAX_LIST_NAME_LENGTH = 60;
  const MAX_ITEMS_PER_CATEGORY = 500;

  // --- State ---------------------------------------------------------

  const state = {
    lists: {},
    activeListId: null,
  };

  let storageError = false;

  // --- Safe storage --------------------------------------------------

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      storageError = false;
      return true;
    } catch (e) {
      storageError = true;
      showStorageWarning();
      return false;
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // Silent — if we can't remove, we also can't really recover
    }
  }

  function showStorageWarning() {
    // Only show once per page load
    if (document.getElementById("storageWarning")) return;
    const warning = document.createElement("div");
    warning.id = "storageWarning";
    warning.className = "storage-warning";
    warning.textContent = "Couldn't save to this browser. You may be in private browsing or out of space.";
    document.body.appendChild(warning);
    setTimeout(function () { warning.classList.add("fading"); }, 4000);
    setTimeout(function () { if (warning.parentNode) warning.parentNode.removeChild(warning); }, 5000);
  }

  // --- Load + migrate ------------------------------------------------

  function load() {
    const raw = safeGet(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.lists) {
          state.lists = migrate(parsed).lists || {};
          return;
        }
      } catch (e) {
        // Fall through to legacy migration
      }
    }
    // Try to migrate from any legacy key
    for (let i = 0; i < LEGACY_KEYS.length; i++) {
      const legacyRaw = safeGet(LEGACY_KEYS[i]);
      if (legacyRaw) {
        try {
          const legacyData = JSON.parse(legacyRaw);
          state.lists = migrateLegacy(legacyData, LEGACY_KEYS[i]) || {};
          // Persist in new shape and remove old key
          save();
          safeRemove(LEGACY_KEYS[i]);
          return;
        } catch (e) {
          // Try the next legacy key
        }
      }
    }
    state.lists = {};
  }

  function migrate(envelope) {
    // Future: if envelope.version < SCHEMA_VERSION, apply transformations
    // Example:
    // if ((envelope.version || 0) < 2) { envelope = transformV1ToV2(envelope); }
    if (!envelope.version) envelope.version = SCHEMA_VERSION;
    return envelope;
  }

  function migrateLegacy(legacyData, fromKey) {
    // v2, v3, v4, v5 all stored a map of { [listId]: list }
    // v1 stored an array of lists
    if (Array.isArray(legacyData)) {
      const obj = {};
      legacyData.forEach(function (list, idx) {
        obj["legacy-" + idx] = list;
      });
      return obj;
    }
    if (legacyData && typeof legacyData === "object") {
      // The list objects are already close enough to the new shape.
      // If any list has a flat `items` array (v1/v2 shape), wrap into a single "Items" category.
      const out = {};
      Object.keys(legacyData).forEach(function (id) {
        const list = legacyData[id];
        if (list && Array.isArray(list.items) && !list.categories) {
          out[id] = {
            categories: [{ name: "Items", items: list.items }],
          };
          if (list.isCustom) {
            out[id].isCustom = true;
            out[id].name = list.name;
            out[id].emoji = list.emoji || "📋";
            out[id].description = list.description || "Custom list";
          }
        } else {
          out[id] = list;
        }
      });
      return out;
    }
    return {};
  }

  function save() {
    const envelope = { version: SCHEMA_VERSION, lists: state.lists };
    safeSet(STORAGE_KEY, JSON.stringify(envelope));
  }

  // --- Utility -------------------------------------------------------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clampText(str, maxLen) {
    if (typeof str !== "string") return "";
    const trimmed = str.trim();
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // --- Templates & metadata ------------------------------------------

  function getTemplate(id) {
    return window.TEMPLATES.find(function (t) { return t.id === id; });
  }

  function getListMeta(id) {
    const list = state.lists[id];
    if (list && list.isCustom) {
      return {
        name: list.name,
        emoji: list.emoji,
        description: list.description || "Custom list",
      };
    }
    const tpl = getTemplate(id);
    if (tpl) {
      return { name: tpl.name, emoji: tpl.emoji, description: tpl.description };
    }
    return null;
  }

  function freshListFromTemplate(tpl) {
    return {
      categories: tpl.categories.map(function (cat) {
        return {
          name: cat.name,
          items: cat.items.map(function (text) { return { text: text, checked: false }; }),
        };
      }),
    };
  }

  function ensureList(id) {
    if (!state.lists[id]) {
      const tpl = getTemplate(id);
      if (!tpl) return null;
      state.lists[id] = freshListFromTemplate(tpl);
      save();
    }
    return state.lists[id];
  }

  function getCounts(list) {
    let total = 0, done = 0;
    list.categories.forEach(function (cat) {
      cat.items.forEach(function (item) {
        total++;
        if (item.checked) done++;
      });
    });
    return { total: total, done: done };
  }

  function forEachItem(list, fn) {
    list.categories.forEach(function (cat, ci) {
      cat.items.forEach(function (item, ii) { fn(item, ci, ii); });
    });
  }

  // --- DOM references ------------------------------------------------

  const homeScreen = document.getElementById("homeScreen");
  const listScreen = document.getElementById("listScreen");
  const headerTitle = document.getElementById("headerTitle");
  const backBtn = document.getElementById("backBtn");
  const menuBtn = document.getElementById("menuBtn");
  const scenarioContainer = document.getElementById("scenarioContainer");
  const itemListEl = document.getElementById("itemList");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const addItemForm = document.getElementById("addItemForm");
  const newItemInput = document.getElementById("newItemInput");
  const listMenuModal = document.getElementById("listMenuModal");
  const uncheckAllBtn = document.getElementById("uncheckAllBtn");
  const resetBtn = document.getElementById("resetBtn");
  const renameBtn = document.getElementById("renameBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const newListModal = document.getElementById("newListModal");
  const newListForm = document.getElementById("newListForm");
  const newListNameInput = document.getElementById("newListName");
  const cancelNewListBtn = document.getElementById("cancelNewList");
  const emojiPicker = document.getElementById("emojiPicker");

  if (newItemInput) newItemInput.setAttribute("maxlength", String(MAX_ITEM_TEXT_LENGTH));
  if (newListNameInput) newListNameInput.setAttribute("maxlength", String(MAX_LIST_NAME_LENGTH));

  // --- Navigation ----------------------------------------------------

  function showHome() {
    state.activeListId = null;
    listScreen.classList.add("hidden");
    homeScreen.classList.remove("hidden");
    backBtn.classList.add("hidden");
    menuBtn.classList.add("hidden");
    headerTitle.textContent = "ParentPrep";
    document.body.classList.add("on-home");
    document.body.classList.remove("on-list");
    renderHome();
  }

  function showList(id) {
    const meta = getListMeta(id);
    if (!meta) return;
    ensureList(id);
    state.activeListId = id;
    homeScreen.classList.add("hidden");
    listScreen.classList.remove("hidden");
    backBtn.classList.remove("hidden");
    menuBtn.classList.remove("hidden");
    headerTitle.textContent = meta.emoji + " " + meta.name;
    document.body.classList.add("on-list");
    document.body.classList.remove("on-home");
    renderList();
    window.scrollTo(0, 0);
  }

  backBtn.addEventListener("click", showHome);

  // --- Home: render cards --------------------------------------------

  function buildCard(id, meta, list, hasStarted) {
    let total, done;
    if (hasStarted && list) {
      const counts = getCounts(list);
      total = counts.total;
      done = counts.done;
    } else if (meta.categories) {
      total = meta.categories.reduce(function (n, c) { return n + c.items.length; }, 0);
      done = 0;
    } else {
      total = 0;
      done = 0;
    }

    let progressLabel, progressClass;
    if (!hasStarted) {
      progressLabel = "Tap to start";
      progressClass = "not-started";
    } else if (total === 0) {
      progressLabel = "Empty — tap to add items";
      progressClass = "not-started";
    } else if (done === 0) {
      progressLabel = "Ready to pack";
      progressClass = "ready";
    } else if (done === total) {
      progressLabel = "All packed ✓";
      progressClass = "done";
    } else {
      progressLabel = done + " of " + total + " packed";
      progressClass = "in-progress";
    }

    const pct = total ? (done / total) * 100 : 0;
    const card = document.createElement("li");
    card.className = "scenario-card";
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.innerHTML =
      '<div class="scenario-icon" aria-hidden="true">' + escapeHTML(meta.emoji) + '</div>' +
      '<div class="scenario-body">' +
        '<div class="scenario-title">' + escapeHTML(meta.name) + '</div>' +
        '<div class="scenario-sub">' + escapeHTML(meta.description || "") + '</div>' +
        '<div class="scenario-progress ' + progressClass + '">' + escapeHTML(progressLabel) + '</div>' +
      '</div>' +
      '<div class="scenario-arrow" aria-hidden="true">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>' +
      '</div>' +
      '<div class="scenario-card-progress"></div>';

    // Set width via style property (not inline attribute) so CSP can block 'unsafe-inline'
    const progressEl = card.querySelector(".scenario-card-progress");
    if (progressEl) progressEl.style.width = pct + "%";

    card.addEventListener("click", function () { showList(id); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showList(id);
      }
    });
    return card;
  }

  function renderHome() {
    scenarioContainer.innerHTML = "";

    // Template cards
    const templateGrid = document.createElement("ul");
    templateGrid.className = "scenario-grid";
    window.TEMPLATES.forEach(function (tpl) {
      const list = state.lists[tpl.id];
      const meta = { name: tpl.name, emoji: tpl.emoji, description: tpl.description, categories: tpl.categories };
      templateGrid.appendChild(buildCard(tpl.id, meta, list, !!list));
    });
    scenarioContainer.appendChild(templateGrid);

    // Custom lists section
    const customEntries = Object.keys(state.lists)
      .filter(function (id) { return state.lists[id] && state.lists[id].isCustom; })
      .map(function (id) { return [id, state.lists[id]]; });

    if (customEntries.length > 0) {
      const heading = document.createElement("h2");
      heading.className = "section-title";
      heading.textContent = "Your lists";
      scenarioContainer.appendChild(heading);

      const customGrid = document.createElement("ul");
      customGrid.className = "scenario-grid";
      customEntries.forEach(function (entry) {
        const id = entry[0];
        const list = entry[1];
        const meta = { name: list.name, emoji: list.emoji, description: list.description || "Custom list" };
        customGrid.appendChild(buildCard(id, meta, list, true));
      });
      scenarioContainer.appendChild(customGrid);
    }

    // Create button
    const createBtn = document.createElement("button");
    createBtn.className = "create-list-btn";
    createBtn.type = "button";
    createBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
      '<span>Create your own list</span>';
    createBtn.addEventListener("click", openNewListModal);
    scenarioContainer.appendChild(createBtn);
  }

  // --- List detail rendering -----------------------------------------

  function renderList() {
    const list = state.lists[state.activeListId];
    if (!list) { showHome(); return; }

    itemListEl.innerHTML = "";

    const anyItems = list.categories.some(function (c) { return c.items.length > 0; });

    if (!anyItems) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML =
        '<div class="empty-title">This list is empty</div>' +
        '<div class="empty-sub">Add items using the form below</div>';
      itemListEl.appendChild(empty);
    } else {
      list.categories.forEach(function (cat, catIdx) {
        if (cat.items.length === 0) return;

        const section = document.createElement("section");
        section.className = "item-category";
        if (cat.name === CUSTOM_CATEGORY) section.classList.add("is-custom");

        const header = document.createElement("h3");
        header.className = "category-header";
        header.textContent = cat.name;
        section.appendChild(header);

        const ul = document.createElement("ul");
        ul.className = "category-items";

        cat.items.forEach(function (item, itemIdx) {
          const li = document.createElement("li");
          li.className = "item" + (item.checked ? " checked" : "");
          li.innerHTML =
            '<div class="item-checkbox" role="checkbox" aria-checked="' + (item.checked ? "true" : "false") + '" tabindex="0"></div>' +
            '<div class="item-label">' + escapeHTML(item.text) + '</div>' +
            '<button class="item-delete" aria-label="Delete item">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            '</button>';
          const checkbox = li.querySelector(".item-checkbox");
          const label = li.querySelector(".item-label");
          const delBtn = li.querySelector(".item-delete");

          const toggle = function () {
            list.categories[catIdx].items[itemIdx].checked =
              !list.categories[catIdx].items[itemIdx].checked;
            save();
            renderList();
          };
          checkbox.addEventListener("click", toggle);
          label.addEventListener("click", toggle);
          checkbox.addEventListener("keydown", function (e) {
            if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
          });

          delBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            list.categories[catIdx].items.splice(itemIdx, 1);
            save();
            renderList();
          });

          ul.appendChild(li);
        });

        section.appendChild(ul);
        itemListEl.appendChild(section);
      });
    }

    const counts = getCounts(list);
    const total = counts.total;
    const done = counts.done;
    progressFill.style.width = total ? ((done / total) * 100) + "%" : "0%";
    if (!total) {
      progressText.textContent = "Empty list";
    } else if (done === total) {
      progressText.textContent = "All packed ✓";
    } else {
      progressText.textContent = done + " of " + total + " packed";
    }
  }

  // --- Add item ------------------------------------------------------

  addItemForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const list = state.lists[state.activeListId];
    if (!list) return;
    const text = clampText(newItemInput.value, MAX_ITEM_TEXT_LENGTH);
    if (!text) return;

    let targetCat;
    if (list.isCustom) {
      if (list.categories.length === 0) {
        list.categories.push({ name: CUSTOM_DEFAULT_CATEGORY, items: [] });
      }
      targetCat = list.categories[0];
    } else {
      targetCat = list.categories.find(function (c) { return c.name === CUSTOM_CATEGORY; });
      if (!targetCat) {
        targetCat = { name: CUSTOM_CATEGORY, items: [] };
        list.categories.push(targetCat);
      }
    }

    if (targetCat.items.length >= MAX_ITEMS_PER_CATEGORY) {
      showStorageWarning();
      return;
    }

    targetCat.items.push({ text: text, checked: false });
    save();
    newItemInput.value = "";
    renderList();
  });

  // --- List menu -----------------------------------------------------

  menuBtn.addEventListener("click", function () {
    const list = state.lists[state.activeListId];
    const isCustom = list && list.isCustom;
    resetBtn.classList.toggle("hidden", isCustom);
    renameBtn.classList.toggle("hidden", !isCustom);
    deleteBtn.classList.toggle("hidden", !isCustom);
    listMenuModal.classList.remove("hidden");
  });

  closeMenuBtn.addEventListener("click", function () { listMenuModal.classList.add("hidden"); });
  listMenuModal.addEventListener("click", function (e) {
    if (e.target === listMenuModal) listMenuModal.classList.add("hidden");
  });

  uncheckAllBtn.addEventListener("click", function () {
    const list = state.lists[state.activeListId];
    if (!list) return;
    forEachItem(list, function (item) { item.checked = false; });
    save();
    renderList();
    listMenuModal.classList.add("hidden");
  });

  resetBtn.addEventListener("click", function () {
    if (!confirm("Reset this list to the default items? Anything you've added or removed will be lost.")) return;
    const tpl = getTemplate(state.activeListId);
    if (!tpl) return;
    state.lists[state.activeListId] = freshListFromTemplate(tpl);
    save();
    renderList();
    listMenuModal.classList.add("hidden");
  });

  renameBtn.addEventListener("click", function () {
    const list = state.lists[state.activeListId];
    if (!list || !list.isCustom) return;
    const newName = prompt("Rename list:", list.name);
    if (newName) {
      const clean = clampText(newName, MAX_LIST_NAME_LENGTH);
      if (clean) {
        list.name = clean;
        save();
        const meta = getListMeta(state.activeListId);
        headerTitle.textContent = meta.emoji + " " + meta.name;
      }
    }
    listMenuModal.classList.add("hidden");
  });

  deleteBtn.addEventListener("click", function () {
    const list = state.lists[state.activeListId];
    if (!list || !list.isCustom) return;
    if (!confirm('Delete "' + list.name + '"? This cannot be undone.')) return;
    delete state.lists[state.activeListId];
    save();
    listMenuModal.classList.add("hidden");
    showHome();
  });

  // --- New list modal ------------------------------------------------

  let selectedEmoji = "📋";

  emojiPicker.querySelectorAll(".emoji-option").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedEmoji = btn.dataset.emoji;
      emojiPicker.querySelectorAll(".emoji-option").forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
    });
  });

  function openNewListModal() {
    newListForm.reset();
    selectedEmoji = "📋";
    emojiPicker.querySelectorAll(".emoji-option").forEach(function (b) { b.classList.remove("selected"); });
    const defaultBtn = emojiPicker.querySelector('.emoji-option[data-emoji="📋"]');
    if (defaultBtn) defaultBtn.classList.add("selected");
    newListModal.classList.remove("hidden");
    setTimeout(function () { newListNameInput.focus(); }, 100);
  }

  cancelNewListBtn.addEventListener("click", function () { newListModal.classList.add("hidden"); });
  newListModal.addEventListener("click", function (e) {
    if (e.target === newListModal) newListModal.classList.add("hidden");
  });

  newListForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = clampText(newListNameInput.value, MAX_LIST_NAME_LENGTH);
    if (!name) return;
    const id = "custom-" + uid();
    state.lists[id] = {
      isCustom: true,
      name: name,
      emoji: selectedEmoji,
      description: "Custom list",
      categories: [{ name: CUSTOM_DEFAULT_CATEGORY, items: [] }],
    };
    save();
    newListModal.classList.add("hidden");
    showList(id);
  });

  // --- Error boundary ------------------------------------------------

  function showCrashBoundary(err) {
    try {
      console.error("ParentPrep crashed:", err);
      const boundary = document.getElementById("crashBoundary");
      if (!boundary) return;
      boundary.classList.remove("hidden");

      document.getElementById("crashReload").addEventListener("click", function () {
        window.location.reload();
      });
      document.getElementById("crashReset").addEventListener("click", function () {
        if (!confirm("Clear all your saved lists and start fresh? This cannot be undone.")) return;
        try {
          localStorage.removeItem(STORAGE_KEY);
          LEGACY_KEYS.forEach(function (k) { safeRemove(k); });
        } catch (_) { /* ignore */ }
        window.location.reload();
      });
    } catch (_) {
      // Last resort: replace the body with a plain message using DOM APIs
      // (no innerHTML with inline styles — the CSP would block it anyway).
      try {
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
        const fallback = document.createElement("div");
        fallback.style.padding = "40px";
        fallback.style.textAlign = "center";
        fallback.style.fontFamily = "sans-serif";
        const h = document.createElement("h2");
        h.textContent = "ParentPrep failed to start";
        const p = document.createElement("p");
        p.textContent = "Please reload the page.";
        fallback.appendChild(h);
        fallback.appendChild(p);
        document.body.appendChild(fallback);
      } catch (__) { /* nothing more we can do */ }
    }
  }

  window.addEventListener("error", function (e) { showCrashBoundary(e.error || e.message); });
  window.addEventListener("unhandledrejection", function (e) { showCrashBoundary(e.reason); });

  // --- Init ----------------------------------------------------------

  try {
    load();
    showHome();
  } catch (err) {
    showCrashBoundary(err);
  }
})();
