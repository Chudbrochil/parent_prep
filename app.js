// Packing for Parents — categorized packing lists with localStorage persistence.
//
// Storage shape (wrapped in an envelope so we can migrate safely):
//   { version: <int>, lists: { [listId]: { categories: [{name, items: [{text, checked}]}], isCustom?, name?, emoji?, description? } } }
//
// Never rename STORAGE_KEY again. Bump SCHEMA_VERSION and add a migration instead.

(function () {
  "use strict";

  // --- Constants -----------------------------------------------------

  const APP_NAME = "Packing for Parents";
  const APP_VERSION = "1.1.1";
  const STORAGE_KEY = "parentprep.lists";
  const SCHEMA_VERSION = 1;
  const LEGACY_KEYS = ["parentprep.v5", "parentprep.v4", "parentprep.v3", "parentprep.v2", "parentprep.lists.v1"];
  const IOS_BANNER_DISMISSED_KEY = "parentprep.iosBannerDismissed";

  const CUSTOM_CATEGORY = "My additions";

  // Special list ID for the ephemeral "preview" list when someone visits
  // a share URL. Lives in state.lists for rendering/editing convenience
  // but is excluded from localStorage writes so it doesn't persist
  // across reloads.
  const PREVIEW_LIST_ID = "__preview__";

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
          state.lists = migrateLegacy(legacyData) || {};
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

  function migrateLegacy(legacyData) {
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
    // Exclude the preview list from storage — it's ephemeral by design.
    // The user explicitly saves it via the "Save to my lists" button,
    // at which point it's cloned to a real custom list ID.
    const lists = {};
    Object.keys(state.lists).forEach(function (id) {
      if (id === PREVIEW_LIST_ID) return;
      if (state.lists[id] && state.lists[id].isPreview) return;
      lists[id] = state.lists[id];
    });
    const envelope = { version: SCHEMA_VERSION, lists: lists };
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
  const listMenuModal = document.getElementById("listMenuModal");
  const uncheckAllBtn = document.getElementById("uncheckAllBtn");
  const duplicateBtn = document.getElementById("duplicateBtn");
  const shareBtn = document.getElementById("shareBtn");
  const resetBtn = document.getElementById("resetBtn");
  const renameBtn = document.getElementById("renameBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const shareModal = document.getElementById("shareModal");
  const shareCodeText = document.getElementById("shareCodeText");
  const shareUrlText = document.getElementById("shareUrlText");
  const shareCopyBtn = document.getElementById("shareCopyBtn");
  const shareNativeBtn = document.getElementById("shareNativeBtn");
  const shareCloseBtn = document.getElementById("shareCloseBtn");
  const shareLoadingModal = document.getElementById("shareLoadingModal");
  const shareLoadingText = document.getElementById("shareLoadingText");
  const previewBanner = document.getElementById("previewBanner");
  const previewSaveBtn = document.getElementById("previewSaveBtn");
  const wizardScreen = document.getElementById("wizardScreen");
  const wizardProgress = document.getElementById("wizardProgress");
  const wizardQuestion = document.getElementById("wizardQuestion");
  const wizardOptions = document.getElementById("wizardOptions");
  const wizardBackBtn = document.getElementById("wizardBackBtn");
  const wizardCloseBtn = document.getElementById("wizardCloseBtn");
  const renameModal = document.getElementById("renameModal");
  const renameForm = document.getElementById("renameForm");
  const renameInput = document.getElementById("renameInput");
  const renameCancelBtn = document.getElementById("renameCancelBtn");
  const confirmModal = document.getElementById("confirmModal");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const confirmOkBtn = document.getElementById("confirmOkBtn");

  if (renameInput) renameInput.setAttribute("maxlength", String(MAX_LIST_NAME_LENGTH));

  // --- Reusable modal helpers ----------------------------------------

  let confirmCallback = null;
  let renameCallback = null;

  function showConfirmDialog(opts, onConfirm) {
    confirmTitle.textContent = opts.title || "Are you sure?";
    confirmMessage.textContent = opts.message || "";
    confirmOkBtn.textContent = opts.confirmText || "Confirm";
    confirmOkBtn.classList.toggle("danger", !!opts.danger);
    confirmCallback = onConfirm;
    confirmModal.classList.remove("hidden");
  }

  function hideConfirmDialog() {
    confirmModal.classList.add("hidden");
    confirmCallback = null;
  }

  confirmOkBtn.addEventListener("click", function () {
    const cb = confirmCallback;
    hideConfirmDialog();
    if (cb) cb();
  });
  confirmCancelBtn.addEventListener("click", hideConfirmDialog);
  confirmModal.addEventListener("click", function (e) {
    if (e.target === confirmModal) hideConfirmDialog();
  });

  function showRenameDialog(currentName, onSubmit) {
    renameInput.value = currentName || "";
    renameCallback = onSubmit;
    renameModal.classList.remove("hidden");
    setTimeout(function () { renameInput.focus(); renameInput.select(); }, 100);
  }

  function hideRenameDialog() {
    renameModal.classList.add("hidden");
    renameCallback = null;
  }

  renameCancelBtn.addEventListener("click", hideRenameDialog);
  renameModal.addEventListener("click", function (e) {
    if (e.target === renameModal) hideRenameDialog();
  });
  renameForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const clean = clampText(renameInput.value, MAX_LIST_NAME_LENGTH);
    if (!clean) return;
    const cb = renameCallback;
    hideRenameDialog();
    if (cb) cb(clean);
  });

  // --- Navigation ----------------------------------------------------

  function showHome() {
    // Navigating home from a preview discards the preview silently.
    if (state.lists[PREVIEW_LIST_ID]) {
      delete state.lists[PREVIEW_LIST_ID];
    }
    state.activeListId = null;
    if (typeof resetAddingState === "function") resetAddingState();
    listScreen.classList.add("hidden");
    homeScreen.classList.remove("hidden");
    backBtn.classList.add("hidden");
    menuBtn.classList.add("hidden");
    headerTitle.textContent = APP_NAME;
    document.body.classList.add("on-home");
    document.body.classList.remove("on-list");
    document.body.classList.remove("previewing-shared");
    if (previewBanner) previewBanner.classList.add("hidden");
    renderHome();
  }

  function showList(id) {
    const meta = getListMeta(id);
    if (!meta) return;
    ensureList(id);
    state.activeListId = id;
    if (typeof resetAddingState === "function") resetAddingState();
    homeScreen.classList.add("hidden");
    listScreen.classList.remove("hidden");
    backBtn.classList.remove("hidden");

    // Preview mode: hide the list menu, show the preview banner.
    // The banner holds the "Save to my lists" action, which is the
    // only operation that matters in preview.
    const isPreview = !!(state.lists[id] && state.lists[id].isPreview);
    if (isPreview) {
      menuBtn.classList.add("hidden");
      document.body.classList.add("previewing-shared");
      if (previewBanner) previewBanner.classList.remove("hidden");
    } else {
      menuBtn.classList.remove("hidden");
      document.body.classList.remove("previewing-shared");
      if (previewBanner) previewBanner.classList.add("hidden");
    }

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

    // Create button — launches the wizard
    const createBtn = document.createElement("button");
    createBtn.className = "create-list-btn";
    createBtn.type = "button";
    createBtn.innerHTML =
      '<span class="create-list-sparkle" aria-hidden="true">✨</span>' +
      '<span>Build me a list</span>';
    createBtn.addEventListener("click", openWizard);
    scenarioContainer.appendChild(createBtn);
  }

  // --- List detail rendering -----------------------------------------

  // Which category (by index) has its inline "add item" form open, or null.
  // Only one can be open at a time — simpler on mobile and keeps the UI calm.
  let addingToCategoryIdx = null;
  let shouldFocusAddInputAfterRender = false;

  // Coordinates of the item currently being edited in place, or null.
  // { catIdx, itemIdx }
  let editingItemCoord = null;
  let shouldFocusEditInputAfterRender = false;

  // Which category index is being renamed, or null.
  let editingCategoryIdx = null;
  let shouldFocusCategoryRenameAfterRender = false;

  // Whether the "+ New category" inline form is open.
  let addingNewCategory = false;
  let shouldFocusNewCategoryAfterRender = false;

  function renderList() {
    const list = state.lists[state.activeListId];
    if (!list) { showHome(); return; }

    itemListEl.innerHTML = "";

    // Always render every category that exists on the list (even empty ones),
    // so users can tap "+ Add item" to populate any category directly.
    list.categories.forEach(function (cat, catIdx) {
      const section = document.createElement("section");
      section.className = "item-category";
      if (cat.name === CUSTOM_CATEGORY) section.classList.add("is-custom");
      section.setAttribute("data-cat-idx", String(catIdx));

      // Header row: category name (tap to rename) + small delete button
      const headerRow = document.createElement("div");
      headerRow.className = "category-header-row";

      const isRenamingCat = editingCategoryIdx === catIdx;
      if (isRenamingCat) {
        const renameInput = document.createElement("input");
        renameInput.type = "text";
        renameInput.className = "category-rename-input";
        renameInput.maxLength = 60;
        renameInput.value = cat.name;
        const saveCatRename = function () {
          const newName = clampText(renameInput.value, 60);
          if (newName && newName !== cat.name) {
            list.categories[catIdx].name = newName;
            save();
          }
          editingCategoryIdx = null;
          renderList();
        };
        const cancelCatRename = function () {
          editingCategoryIdx = null;
          renderList();
        };
        renameInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); saveCatRename(); }
          else if (e.key === "Escape") { e.preventDefault(); cancelCatRename(); }
        });
        renameInput.addEventListener("blur", function () {
          setTimeout(function () {
            if (editingCategoryIdx === catIdx) saveCatRename();
          }, 100);
        });
        headerRow.appendChild(renameInput);
        shouldFocusCategoryRenameAfterRender = true;
      } else {
        const header = document.createElement("h3");
        header.className = "category-header";
        header.textContent = cat.name;
        header.title = "Tap to rename";
        header.addEventListener("click", function () {
          // Close any other open editors
          addingToCategoryIdx = null;
          editingItemCoord = null;
          addingNewCategory = false;
          editingCategoryIdx = catIdx;
          shouldFocusCategoryRenameAfterRender = true;
          renderList();
        });
        headerRow.appendChild(header);

        const deleteCatBtn = document.createElement("button");
        deleteCatBtn.type = "button";
        deleteCatBtn.className = "category-delete-btn";
        deleteCatBtn.setAttribute("aria-label", "Delete category " + cat.name);
        deleteCatBtn.title = "Delete category";
        deleteCatBtn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
          '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>' +
          '</svg>';
        deleteCatBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          const itemCount = cat.items.length;
          const messageItems = itemCount === 0
            ? "This category is empty so nothing else will be lost."
            : "All " + itemCount + " item" + (itemCount === 1 ? "" : "s") + " in it will be removed too.";
          showConfirmDialog({
            title: 'Delete "' + cat.name + '"?',
            message: messageItems + " You can restore the original categories with Reset to defaults.",
            confirmText: "Delete",
            danger: true,
          }, function () {
            list.categories.splice(catIdx, 1);
            // Splicing shifts higher indices down by one. Rather than
            // tracking which states need re-indexing vs clearing, just
            // clear all transient editing state — the rare cost (losing
            // an in-progress edit on a different category) is worth the
            // simplicity and consistency.
            addingToCategoryIdx = null;
            editingItemCoord = null;
            editingCategoryIdx = null;
            addingNewCategory = false;
            save();
            renderList();
          });
        });
        headerRow.appendChild(deleteCatBtn);
      }

      section.appendChild(headerRow);

      const ul = document.createElement("ul");
      ul.className = "category-items";

      // Sort items for rendering: unchecked first, checked last.
      // Stable within each group so items don't shuffle unexpectedly.
      // Sort happens on every re-render (after any interaction), so
      // checked items drop to the bottom naturally as you pack.
      const sortedPairs = cat.items
        .map(function (item, origIdx) { return { item: item, origIdx: origIdx }; })
        .sort(function (a, b) {
          if (a.item.checked !== b.item.checked) return a.item.checked ? 1 : -1;
          return a.origIdx - b.origIdx;
        });

      sortedPairs.forEach(function (pair) {
        const item = pair.item;
        const itemIdx = pair.origIdx;
        const isEditing = editingItemCoord
          && editingItemCoord.catIdx === catIdx
          && editingItemCoord.itemIdx === itemIdx;

        const li = document.createElement("li");
        li.className = "item" + (item.checked ? " checked" : "") + (isEditing ? " editing" : "");

        // Checkbox is now wrapped in a 44px button so the hit area is
        // touch-friendly even though the visual circle stays 24px.
        // Label is its own click target — tapping it enters edit mode.
        const labelInner = isEditing
          ? '<input class="item-edit-input" type="text" maxlength="' + MAX_ITEM_TEXT_LENGTH + '">'
          : '<div class="item-label">' + escapeHTML(item.text) + '</div>';

        li.innerHTML =
          '<button type="button" class="item-check" role="checkbox" aria-checked="' + (item.checked ? "true" : "false") + '" aria-label="Toggle packed">' +
            '<span class="item-checkbox"></span>' +
          '</button>' +
          labelInner +
          '<button class="item-delete" aria-label="Delete item">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>';

        const checkBtn = li.querySelector(".item-check");
        const delBtn = li.querySelector(".item-delete");

        const toggle = function () {
          list.categories[catIdx].items[itemIdx].checked =
            !list.categories[catIdx].items[itemIdx].checked;
          save();
          renderList();
        };
        checkBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          toggle();
        });
        checkBtn.addEventListener("keydown", function (e) {
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
        });

        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          list.categories[catIdx].items.splice(itemIdx, 1);
          // If we deleted the item we were editing, clear the edit state
          if (isEditing) editingItemCoord = null;
          save();
          renderList();
        });

        if (isEditing) {
          const editInput = li.querySelector(".item-edit-input");
          editInput.value = item.text;

          const saveEdit = function () {
            const newText = clampText(editInput.value, MAX_ITEM_TEXT_LENGTH);
            // Only save if there's actual text — otherwise treat as cancel
            if (newText && newText !== item.text) {
              list.categories[catIdx].items[itemIdx].text = newText;
              save();
            }
            editingItemCoord = null;
            renderList();
          };

          const cancelEdit = function () {
            editingItemCoord = null;
            renderList();
          };

          editInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
          });
          // Save on blur (tapping anywhere outside the input)
          editInput.addEventListener("blur", function () {
            // Defer slightly so an immediate click on something else is processed
            // first (e.g., delete button click should still work)
            setTimeout(function () {
              if (editingItemCoord && editingItemCoord.catIdx === catIdx && editingItemCoord.itemIdx === itemIdx) {
                saveEdit();
              }
            }, 100);
          });

          shouldFocusEditInputAfterRender = true;
        } else {
          // Tapping the label (not the checkbox, not the delete button)
          // enters edit mode. Tapping the checkbox circle still toggles.
          const label = li.querySelector(".item-label");
          if (label) {
            label.addEventListener("click", function (e) {
              e.stopPropagation();
              // Close any active add form before entering edit mode
              addingToCategoryIdx = null;
              editingItemCoord = { catIdx: catIdx, itemIdx: itemIdx };
              shouldFocusEditInputAfterRender = true;
              renderList();
            });
          }
        }

        ul.appendChild(li);
      });

      section.appendChild(ul);

      // Per-category add-item affordance: either the "+ Add item" button
      // when inactive, or an inline form when this is the active category.
      if (addingToCategoryIdx === catIdx) {
        const form = document.createElement("form");
        form.className = "category-add-form";
        form.innerHTML =
          '<input type="text" placeholder="Add an item to ' + escapeHTML(cat.name) + '…" autocomplete="off" required maxlength="' + MAX_ITEM_TEXT_LENGTH + '">' +
          '<button type="submit" class="category-add-submit" aria-label="Add">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
          '</button>' +
          '<button type="button" class="category-add-cancel" aria-label="Cancel">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>';
        const input = form.querySelector("input");
        const cancel = form.querySelector(".category-add-cancel");

        form.addEventListener("submit", function (e) {
          e.preventDefault();
          const text = clampText(input.value, MAX_ITEM_TEXT_LENGTH);
          if (!text) return;
          const targetCat = list.categories[catIdx];
          if (targetCat.items.length >= MAX_ITEMS_PER_CATEGORY) {
            showStorageWarning();
            return;
          }
          targetCat.items.push({ text: text, checked: false });
          save();
          // Keep the form open for adding more — makes multi-add fast.
          shouldFocusAddInputAfterRender = true;
          renderList();
        });

        cancel.addEventListener("click", function () {
          addingToCategoryIdx = null;
          renderList();
        });

        input.addEventListener("keydown", function (e) {
          if (e.key === "Escape") {
            e.preventDefault();
            addingToCategoryIdx = null;
            renderList();
          }
        });

        section.appendChild(form);
      } else {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "category-add-btn";
        addBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
          '<span>Add item</span>';
        addBtn.addEventListener("click", function () {
          addingToCategoryIdx = catIdx;
          shouldFocusAddInputAfterRender = true;
          renderList();
        });
        section.appendChild(addBtn);
      }

      itemListEl.appendChild(section);
    });

    // "+ New category" affordance at the bottom of the list — either the
    // pill button when inactive, or an inline form when adding.
    if (addingNewCategory) {
      const form = document.createElement("form");
      form.className = "new-category-form";
      form.innerHTML =
        '<input type="text" placeholder="New category name…" autocomplete="off" required maxlength="60">' +
        '<button type="submit" class="category-add-submit" aria-label="Create category">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
        '</button>' +
        '<button type="button" class="category-add-cancel" aria-label="Cancel">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>';
      const newCatInput = form.querySelector("input");
      const newCatCancel = form.querySelector(".category-add-cancel");

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        const name = clampText(newCatInput.value, 60);
        if (!name) return;
        list.categories.push({ name: name, items: [] });
        save();
        addingNewCategory = false;
        // Auto-open the "+ Add item" form on the brand-new category so
        // the user can populate it immediately.
        addingToCategoryIdx = list.categories.length - 1;
        shouldFocusAddInputAfterRender = true;
        renderList();
      });

      newCatCancel.addEventListener("click", function () {
        addingNewCategory = false;
        renderList();
      });

      newCatInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          e.preventDefault();
          addingNewCategory = false;
          renderList();
        }
      });

      itemListEl.appendChild(form);
      shouldFocusNewCategoryAfterRender = true;
    } else {
      const newCatBtn = document.createElement("button");
      newCatBtn.type = "button";
      newCatBtn.className = "new-category-btn";
      newCatBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
        '<span>New category</span>';
      newCatBtn.addEventListener("click", function () {
        // Close any other inline editors first
        addingToCategoryIdx = null;
        editingItemCoord = null;
        editingCategoryIdx = null;
        addingNewCategory = true;
        shouldFocusNewCategoryAfterRender = true;
        renderList();
      });
      itemListEl.appendChild(newCatBtn);
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

    // Restore focus to the active add-input after a re-render
    if (shouldFocusAddInputAfterRender && addingToCategoryIdx !== null) {
      shouldFocusAddInputAfterRender = false;
      const activeSection = itemListEl.querySelector('[data-cat-idx="' + addingToCategoryIdx + '"]');
      if (activeSection) {
        const input = activeSection.querySelector(".category-add-form input");
        if (input) {
          setTimeout(function () { input.focus(); }, 0);
        }
      }
    }

    // Restore focus to the edit-input after a re-render and select all text
    if (shouldFocusEditInputAfterRender && editingItemCoord) {
      shouldFocusEditInputAfterRender = false;
      const editInput = itemListEl.querySelector(".item.editing .item-edit-input");
      if (editInput) {
        setTimeout(function () { editInput.focus(); editInput.select(); }, 0);
      }
    }

    // Restore focus to the category-rename input after a re-render
    if (shouldFocusCategoryRenameAfterRender && editingCategoryIdx !== null) {
      shouldFocusCategoryRenameAfterRender = false;
      const renameInput = itemListEl.querySelector(".category-rename-input");
      if (renameInput) {
        setTimeout(function () { renameInput.focus(); renameInput.select(); }, 0);
      }
    }

    // Restore focus to the new-category input after a re-render
    if (shouldFocusNewCategoryAfterRender && addingNewCategory) {
      shouldFocusNewCategoryAfterRender = false;
      const newCatInput = itemListEl.querySelector(".new-category-form input");
      if (newCatInput) {
        setTimeout(function () { newCatInput.focus(); }, 0);
      }
    }

    maybeCelebrate(list);
  }

  // Reset transient UI state whenever the user navigates away from a list
  // so stale state doesn't leak between lists.
  function resetAddingState() {
    addingToCategoryIdx = null;
    shouldFocusAddInputAfterRender = false;
    editingItemCoord = null;
    shouldFocusEditInputAfterRender = false;
    editingCategoryIdx = null;
    shouldFocusCategoryRenameAfterRender = false;
    addingNewCategory = false;
    shouldFocusNewCategoryAfterRender = false;
  }

  // Adding items is now handled per-category inside renderList.
  // The old sticky bottom form is gone; users tap "+ Add item" under
  // the specific category where the item belongs.

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

  duplicateBtn.addEventListener("click", function () {
    const list = state.lists[state.activeListId];
    if (!list) return;
    const meta = getListMeta(state.activeListId);
    if (!meta) return;

    // Deep clone categories + items so editing the copy doesn't touch the original
    const clonedCategories = list.categories.map(function (cat) {
      return {
        name: cat.name,
        items: cat.items.map(function (it) {
          return { text: it.text, checked: !!it.checked };
        }),
      };
    });

    // Auto-name: "My <original name>", unless the name already starts with "My "
    let newName = meta.name;
    if (!/^my\s/i.test(newName)) newName = "My " + newName;

    const newId = "custom-" + uid();
    state.lists[newId] = {
      isCustom: true,
      name: newName,
      emoji: meta.emoji || "📋",
      description: meta.description || "Custom list",
      categories: clonedCategories,
    };
    save();
    listMenuModal.classList.add("hidden");
    showList(newId);
  });

  resetBtn.addEventListener("click", function () {
    listMenuModal.classList.add("hidden");
    showConfirmDialog({
      title: "Reset this list?",
      message: "This restores the original template items. Anything you added or removed will be lost.",
      confirmText: "Reset",
      danger: true,
    }, function () {
      const tpl = getTemplate(state.activeListId);
      if (!tpl) return;
      state.lists[state.activeListId] = freshListFromTemplate(tpl);
      save();
      renderList();
    });
  });

  renameBtn.addEventListener("click", function () {
    const list = state.lists[state.activeListId];
    if (!list || !list.isCustom) return;
    listMenuModal.classList.add("hidden");
    showRenameDialog(list.name, function (newName) {
      list.name = newName;
      save();
      const meta = getListMeta(state.activeListId);
      headerTitle.textContent = meta.emoji + " " + meta.name;
      renderList();
    });
  });

  deleteBtn.addEventListener("click", function () {
    const list = state.lists[state.activeListId];
    if (!list || !list.isCustom) return;
    listMenuModal.classList.add("hidden");
    showConfirmDialog({
      title: "Delete this list?",
      message: '"' + list.name + '" and all its items will be permanently removed. This cannot be undone.',
      confirmText: "Delete",
      danger: true,
    }, function () {
      delete state.lists[state.activeListId];
      save();
      showHome();
    });
  });

  // --- Wizard --------------------------------------------------------

  const wizardState = {
    active: false,
    step: 1,
    answers: {},
  };

  function openWizard() {
    wizardState.active = true;
    wizardState.step = 1;
    wizardState.answers = {};
    try {
      history.pushState({ wizard: true }, "", "#wizard");
    } catch (_) { /* history API unavailable */ }
    wizardScreen.classList.remove("hidden");
    wizardScreen.setAttribute("aria-hidden", "false");
    document.body.classList.add("wizard-active");
    renderWizard();
  }

  function closeWizard() {
    if (!wizardState.active) return;
    wizardState.active = false;
    wizardScreen.classList.add("hidden");
    wizardScreen.setAttribute("aria-hidden", "true");
    document.body.classList.remove("wizard-active");
    // Pop our wizard history state so browser back doesn't re-enter it
    try {
      if (history.state && history.state.wizard) history.back();
    } catch (_) { /* ignore */ }
  }

  function renderWizard() {
    if (!window.WIZARD) return;
    const stepIdx = wizardState.step - 1;
    const step = window.WIZARD.STEPS[stepIdx];
    if (!step) return;

    // Progress dots
    wizardProgress.innerHTML = "";
    for (let i = 0; i < window.WIZARD.STEPS.length; i++) {
      const dot = document.createElement("div");
      dot.className = "wizard-dot";
      if (i < stepIdx) dot.classList.add("completed");
      if (i === stepIdx) dot.classList.add("active");
      wizardProgress.appendChild(dot);
    }

    wizardQuestion.textContent = step.question;

    // Options
    wizardOptions.innerHTML = "";
    step.options.forEach(function (opt) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wizard-option";
      btn.innerHTML =
        '<div class="wizard-option-emoji" aria-hidden="true">' + escapeHTML(opt.emoji) + '</div>' +
        '<div class="wizard-option-text">' +
          '<div class="wizard-option-title">' + escapeHTML(opt.title) + '</div>' +
          '<div class="wizard-option-sub">' + escapeHTML(opt.sub) + '</div>' +
        '</div>';
      btn.addEventListener("click", function () {
        wizardState.answers[step.key] = opt.value;
        advanceWizardStep();
      });
      wizardOptions.appendChild(btn);
    });

    // Back button visibility
    if (wizardState.step > 1) {
      wizardBackBtn.classList.remove("hidden");
    } else {
      wizardBackBtn.classList.add("hidden");
    }

    // Scroll to top on each step change
    if (wizardScreen) wizardScreen.scrollTop = 0;
  }

  function advanceWizardStep() {
    if (!window.WIZARD) return;
    if (wizardState.step >= window.WIZARD.STEPS.length) {
      finishWizard();
      return;
    }
    wizardState.step++;
    renderWizard();
  }

  function wizardBack() {
    if (wizardState.step <= 1) {
      closeWizard();
    } else {
      wizardState.step--;
      renderWizard();
    }
  }

  wizardBackBtn.addEventListener("click", wizardBack);
  wizardCloseBtn.addEventListener("click", closeWizard);

  window.addEventListener("popstate", function (e) {
    if (wizardState.active && !(e.state && e.state.wizard)) {
      wizardState.active = false;
      wizardScreen.classList.add("hidden");
      wizardScreen.setAttribute("aria-hidden", "true");
      document.body.classList.remove("wizard-active");
    }
  });

  function finishWizard() {
    if (!window.WIZARD) return;
    const spec = window.WIZARD.generateListSpec(wizardState.answers);
    const id = "custom-" + uid();
    state.lists[id] = {
      isCustom: true,
      name: spec.name,
      emoji: spec.emoji,
      description: spec.description,
      categories: spec.categories,
    };
    save();
    closeWizard();
    showList(id);
  }

  // --- Celebration ---------------------------------------------------

  const celebrationEl = document.getElementById("celebration");
  let celebrationShownForList = null;

  function maybeCelebrate(list) {
    if (!list || !celebrationEl) return;
    const counts = getCounts(list);
    if (counts.total > 0 && counts.done === counts.total) {
      // Only fire once per reach-complete (reset when uncheck happens)
      if (celebrationShownForList === state.activeListId) return;
      celebrationShownForList = state.activeListId;
      celebrationEl.classList.remove("hidden");
      celebrationEl.setAttribute("aria-hidden", "false");
      setTimeout(function () {
        celebrationEl.classList.add("hidden");
        celebrationEl.setAttribute("aria-hidden", "true");
      }, 2400);
    } else if (counts.done < counts.total) {
      // If they unchecked something, reset the shown-state so it fires again
      if (celebrationShownForList === state.activeListId) {
        celebrationShownForList = null;
      }
    }
  }

  // --- Feedback modal ------------------------------------------------

  const feedbackBtn = document.getElementById("feedbackBtn");
  const feedbackModal = document.getElementById("feedbackModal");
  const feedbackForm = document.getElementById("feedbackForm");
  const feedbackCancelBtn = document.getElementById("feedbackCancelBtn");
  const feedbackMessageInput = document.getElementById("feedbackMessage");

  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", function () {
      feedbackModal.classList.remove("hidden");
      setTimeout(function () { feedbackMessageInput.focus(); }, 100);
    });
  }

  if (feedbackCancelBtn) {
    feedbackCancelBtn.addEventListener("click", function () {
      feedbackModal.classList.add("hidden");
    });
  }

  if (feedbackModal) {
    feedbackModal.addEventListener("click", function (e) {
      if (e.target === feedbackModal) feedbackModal.classList.add("hidden");
    });
  }

  if (feedbackForm) {
    feedbackForm.addEventListener("submit", function (e) {
      e.preventDefault();
      // POST to Netlify's form endpoint (same URL as the page)
      const formData = new FormData(feedbackForm);
      const body = new URLSearchParams();
      formData.forEach(function (value, key) { body.append(key, value); });

      const submitBtn = feedbackForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }).then(function () {
        feedbackForm.reset();
        feedbackModal.classList.add("hidden");
        showToast("Thanks — message sent!");
      }).catch(function () {
        showToast("Couldn't send. Please try again.");
      }).finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Send"; }
      });
    });
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "storage-warning";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add("fading"); }, 2200);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
  }

  // --- Export / Import ----------------------------------------------

  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");

  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      const payload = {
        app: APP_NAME,
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        schema: SCHEMA_VERSION,
        lists: state.lists,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "packing-for-parents-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Lists exported");
    });
  }

  if (importBtn && importFileInput) {
    importBtn.addEventListener("click", function () {
      importFileInput.value = "";
      importFileInput.click();
    });

    importFileInput.addEventListener("change", function () {
      const file = importFileInput.files && importFileInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showToast("File too large (max 5MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed || typeof parsed !== "object" || !parsed.lists) {
            showToast("That doesn't look like a Packing for Parents export");
            return;
          }
          showConfirmDialog({
            title: "Import these lists?",
            message: "This will merge the imported lists with your existing ones. Lists with matching IDs will be overwritten.",
            confirmText: "Import",
          }, function () {
            Object.keys(parsed.lists).forEach(function (id) {
              state.lists[id] = parsed.lists[id];
            });
            save();
            renderHome();
            showToast("Lists imported");
          });
        } catch (err) {
          showToast("Couldn't read that file");
        }
      };
      reader.readAsText(file);
    });
  }

  // --- Version label -------------------------------------------------

  const versionLabel = document.getElementById("versionLabel");
  if (versionLabel) versionLabel.textContent = "v" + APP_VERSION;

  // --- iOS install banner -------------------------------------------

  const iosBanner = document.getElementById("iosBanner");
  const iosBannerDismiss = document.getElementById("iosBannerDismiss");

  function isIOSSafari() {
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    return iOS && webkit;
  }

  function isStandalone() {
    return (
      window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
    ) || window.navigator.standalone === true;
  }

  function maybeShowIOSBanner() {
    if (!iosBanner) return;
    if (!isIOSSafari()) return;
    if (isStandalone()) return;
    if (safeGet(IOS_BANNER_DISMISSED_KEY)) return;
    iosBanner.classList.remove("hidden");
  }

  if (iosBannerDismiss) {
    iosBannerDismiss.addEventListener("click", function () {
      iosBanner.classList.add("hidden");
      safeSet(IOS_BANNER_DISMISSED_KEY, "1");
    });
  }

  // --- Share & import ------------------------------------------------

  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      const list = state.lists[state.activeListId];
      const meta = getListMeta(state.activeListId);
      if (!list || !meta) return;
      listMenuModal.classList.add("hidden");
      createShareForList(list, meta);
    });
  }

  function showShareLoading(text) {
    if (shareLoadingText) shareLoadingText.textContent = text;
    shareLoadingModal.classList.remove("hidden");
  }
  function hideShareLoading() {
    shareLoadingModal.classList.add("hidden");
  }

  function createShareForList(list, meta) {
    showShareLoading("Creating your share link…");
    const payload = {
      list: {
        name: meta.name,
        emoji: meta.emoji,
        description: meta.description,
        categories: list.categories,
      },
    };
    fetch("/api/share-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("share-create returned " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.slug) throw new Error("Missing slug in response");
        hideShareLoading();
        showShareModal(data.slug);
      })
      .catch(function (err) {
        hideShareLoading();
        showToast("Couldn't create share link. Try again?");
      });
  }

  function showShareModal(slug) {
    const fullUrl = window.location.origin + "/s/" + slug;
    shareCodeText.textContent = slug;
    shareUrlText.textContent = fullUrl;
    shareModal.classList.remove("hidden");
  }

  if (shareCopyBtn) {
    shareCopyBtn.addEventListener("click", function () {
      const url = shareUrlText.textContent;
      if (!url || url === "—") return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          showToast("Link copied!");
        }).catch(function () {
          showToast("Couldn't copy — try the Share button");
        });
      } else {
        showToast("Copy not supported on this browser");
      }
    });
  }

  if (shareNativeBtn) {
    shareNativeBtn.addEventListener("click", function () {
      const url = shareUrlText.textContent;
      const slug = shareCodeText.textContent;
      if (!url || url === "—") return;
      if (navigator.share) {
        navigator.share({
          title: "Packing for Parents",
          text: "I made a packing list — open it with this code: " + slug,
          url: url,
        }).catch(function () { /* user cancelled or share unsupported */ });
      } else {
        // Fallback: copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            showToast("Link copied — paste it anywhere");
          });
        }
      }
    });
  }

  if (shareCloseBtn) {
    shareCloseBtn.addEventListener("click", function () { shareModal.classList.add("hidden"); });
  }
  if (shareModal) {
    shareModal.addEventListener("click", function (e) {
      if (e.target === shareModal) shareModal.classList.add("hidden");
    });
  }

  // --- Import / preview flow -----------------------------------------
  //
  // When the user lands on /s/:slug, we fetch the shared list and drop
  // them directly into a "preview" view of it. The preview is a normal
  // list (they can check items, edit, add) but lives under a reserved
  // list ID (PREVIEW_LIST_ID) and is excluded from storage writes, so
  // it disappears when they navigate home. A banner at the top offers
  // "Save to my lists" which clones the preview to a real custom list.

  // Pure slug-extraction helper, also useful for tests.
  // Tries pathname first (for /s/:slug rewrites), then ?s= fallback.
  function parseSlugFromLocation(pathname, search) {
    const SLUG_RE = /^[a-z]+-[a-z]+-[a-z]+$/;
    if (pathname) {
      const m = pathname.match(/^\/s\/([a-z]+-[a-z]+-[a-z]+)$/);
      if (m && SLUG_RE.test(m[1])) return m[1];
    }
    if (search) {
      try {
        const params = new URLSearchParams(search);
        const s = params.get("s");
        if (s && SLUG_RE.test(s)) return s;
      } catch (_) { /* ignore */ }
    }
    return null;
  }

  function detectAndImportFromUrl() {
    const slug = parseSlugFromLocation(window.location.pathname, window.location.search);
    if (!slug) return;

    // If the user already saved a copy of this slug, jump to it.
    const existingId = Object.keys(state.lists).find(function (id) {
      const list = state.lists[id];
      return list && list.importedFrom === slug && !list.isPreview;
    });
    if (existingId) {
      cleanShareParamFromUrl();
      showList(existingId);
      showToast("You already have this shared list");
      return;
    }

    showShareLoading("Loading shared list…");
    fetch("/api/share-get?slug=" + encodeURIComponent(slug))
      .then(function (res) {
        if (res.status === 404) throw new Error("not-found");
        if (res.status === 410) throw new Error("expired");
        if (!res.ok) throw new Error("fetch-failed");
        return res.json();
      })
      .then(function (data) {
        hideShareLoading();
        if (!data || !data.list) throw new Error("missing list");
        showPreviewList(data.list, slug);
      })
      .catch(function (err) {
        hideShareLoading();
        const msg = err && err.message;
        if (msg === "not-found") {
          showToast("That share link wasn't found");
        } else if (msg === "expired") {
          showToast("That share link has expired");
        } else {
          showToast("Couldn't load the shared list");
        }
        cleanShareParamFromUrl();
      });
  }

  function showPreviewList(list, slug) {
    // Stash the shared list under the reserved preview ID. The render
    // loop treats it like any other list, but save() skips it so
    // nothing persists until the user hits "Save to my lists".
    state.lists[PREVIEW_LIST_ID] = {
      isCustom: true,
      isPreview: true,
      importedFrom: slug,
      name: clampText(list.name, MAX_LIST_NAME_LENGTH) || "Shared list",
      emoji: typeof list.emoji === "string" ? list.emoji : "📋",
      description: list.description || "Shared with you",
      categories: (list.categories || []).map(function (c) {
        return {
          name: c.name,
          items: (c.items || []).map(function (it) {
            return { text: it.text, checked: false };
          }),
        };
      }),
    };
    showList(PREVIEW_LIST_ID);
  }

  function saveCurrentPreview() {
    const preview = state.lists[PREVIEW_LIST_ID];
    if (!preview || !preview.isPreview) return;

    // Clone the preview to a real custom list ID
    const newId = "custom-" + uid();
    state.lists[newId] = {
      isCustom: true,
      name: preview.name,
      emoji: preview.emoji,
      description: preview.description,
      importedFrom: preview.importedFrom,
      categories: preview.categories.map(function (c) {
        return {
          name: c.name,
          items: c.items.map(function (it) {
            return { text: it.text, checked: !!it.checked };
          }),
        };
      }),
    };
    delete state.lists[PREVIEW_LIST_ID];
    save();
    cleanShareParamFromUrl();
    showList(newId);
    showToast("Saved to your lists!");
  }

  if (previewSaveBtn) {
    previewSaveBtn.addEventListener("click", saveCurrentPreview);
  }

  function cleanShareParamFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("s");
      let newPath = url.pathname;
      if (/^\/s\/[a-z-]+$/.test(newPath)) newPath = "/";
      const cleanUrl = url.origin + newPath + (url.search || "");
      history.replaceState(null, "", cleanUrl);
    } catch (e) { /* ignore */ }
  }

  // --- Error boundary ------------------------------------------------

  function showCrashBoundary(err) {
    try {
      console.error("Packing for Parents crashed:", err);
      const boundary = document.getElementById("crashBoundary");
      if (!boundary) return;
      boundary.classList.remove("hidden");

      document.getElementById("crashReload").addEventListener("click", function () {
        window.location.reload();
      });
      document.getElementById("crashReset").addEventListener("click", function () {
        showConfirmDialog({
          title: "Clear all saved data?",
          message: "All your lists and packed items will be permanently removed. This cannot be undone.",
          confirmText: "Clear everything",
          danger: true,
        }, function () {
          try {
            localStorage.removeItem(STORAGE_KEY);
            LEGACY_KEYS.forEach(function (k) { safeRemove(k); });
          } catch (_) { /* ignore */ }
          window.location.reload();
        });
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
        h.textContent = "Packing for Parents failed to start";
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
    maybeShowIOSBanner();
    detectAndImportFromUrl();
  } catch (err) {
    showCrashBoundary(err);
  }
})();
