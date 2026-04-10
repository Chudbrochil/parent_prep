// ParentPrep — categorized packing lists with custom lists and localStorage.
// Storage model:
//   state.lists = {
//     "short-trip": { categories: [...] },         // template-backed
//     "custom-abc123": {                            // user-created
//       isCustom: true, name, emoji, description,
//       categories: [{ name, items: [{text, checked}] }]
//     }
//   }

const STORAGE_KEY = "parentprep.v5";
const CUSTOM_CATEGORY = "My additions";
const CUSTOM_DEFAULT_CATEGORY = "My items";

const state = {
  lists: {},
  activeListId: null,
};

// --- Storage -------------------------------------------------------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.lists = JSON.parse(raw) || {};
  } catch (e) {
    state.lists = {};
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lists));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Templates & metadata ------------------------------------------

function getTemplate(id) {
  return window.TEMPLATES.find(t => t.id === id);
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
    categories: tpl.categories.map(cat => ({
      name: cat.name,
      items: cat.items.map(text => ({ text, checked: false })),
    })),
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
  list.categories.forEach(cat => {
    cat.items.forEach(item => {
      total++;
      if (item.checked) done++;
    });
  });
  return { total, done };
}

function forEachItem(list, fn) {
  list.categories.forEach((cat, ci) => {
    cat.items.forEach((item, ii) => fn(item, ci, ii));
  });
}

// --- Navigation ----------------------------------------------------

const homeScreen = document.getElementById("homeScreen");
const listScreen = document.getElementById("listScreen");
const headerTitle = document.getElementById("headerTitle");
const backBtn = document.getElementById("backBtn");
const menuBtn = document.getElementById("menuBtn");

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
  headerTitle.textContent = `${meta.emoji} ${meta.name}`;
  document.body.classList.add("on-list");
  document.body.classList.remove("on-home");
  renderList();
  window.scrollTo(0, 0);
}

backBtn.addEventListener("click", showHome);

// --- Home: render cards --------------------------------------------

const scenarioContainer = document.getElementById("scenarioContainer");

function buildCard(id, meta, list, hasStarted) {
  let total, done;
  if (hasStarted && list) {
    ({ total, done } = getCounts(list));
  } else if (meta.categories) {
    total = meta.categories.reduce((n, c) => n + c.items.length, 0);
    done = 0;
  } else {
    total = 0;
    done = 0;
  }

  let progressText, progressClass;
  if (!hasStarted) {
    progressText = "Tap to start";
    progressClass = "not-started";
  } else if (total === 0) {
    progressText = "Empty — tap to add items";
    progressClass = "not-started";
  } else if (done === 0) {
    progressText = "Ready to pack";
    progressClass = "ready";
  } else if (done === total) {
    progressText = "All packed ✓";
    progressClass = "done";
  } else {
    progressText = `${done} of ${total} packed`;
    progressClass = "in-progress";
  }

  const pct = total ? (done / total) * 100 : 0;
  const card = document.createElement("li");
  card.className = "scenario-card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.innerHTML = `
    <div class="scenario-icon" aria-hidden="true">${meta.emoji}</div>
    <div class="scenario-body">
      <div class="scenario-title">${escapeHTML(meta.name)}</div>
      <div class="scenario-sub">${escapeHTML(meta.description || "")}</div>
      <div class="scenario-progress ${progressClass}">${progressText}</div>
    </div>
    <div class="scenario-arrow" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>
    <div class="scenario-card-progress" style="width:${pct}%"></div>
  `;
  card.addEventListener("click", () => showList(id));
  card.addEventListener("keydown", (e) => {
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
  window.TEMPLATES.forEach(tpl => {
    const list = state.lists[tpl.id];
    const meta = { name: tpl.name, emoji: tpl.emoji, description: tpl.description, categories: tpl.categories };
    templateGrid.appendChild(buildCard(tpl.id, meta, list, !!list));
  });
  scenarioContainer.appendChild(templateGrid);

  // Custom lists section
  const customEntries = Object.entries(state.lists).filter(([id, list]) => list && list.isCustom);
  if (customEntries.length > 0) {
    const heading = document.createElement("h2");
    heading.className = "section-title";
    heading.textContent = "Your lists";
    scenarioContainer.appendChild(heading);

    const customGrid = document.createElement("ul");
    customGrid.className = "scenario-grid";
    customEntries.forEach(([id, list]) => {
      const meta = { name: list.name, emoji: list.emoji, description: list.description || "Custom list" };
      customGrid.appendChild(buildCard(id, meta, list, true));
    });
    scenarioContainer.appendChild(customGrid);
  }

  // Create button
  const createBtn = document.createElement("button");
  createBtn.className = "create-list-btn";
  createBtn.type = "button";
  createBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    <span>Create your own list</span>
  `;
  createBtn.addEventListener("click", openNewListModal);
  scenarioContainer.appendChild(createBtn);
}

// --- List detail rendering -----------------------------------------

const itemListEl = document.getElementById("itemList");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");

function renderList() {
  const list = state.lists[state.activeListId];
  if (!list) { showHome(); return; }

  itemListEl.innerHTML = "";

  const anyItems = list.categories.some(c => c.items.length > 0);

  if (!anyItems) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-title">This list is empty</div>
      <div class="empty-sub">Add items using the form below</div>
    `;
    itemListEl.appendChild(empty);
  } else {
    list.categories.forEach((cat, catIdx) => {
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

      cat.items.forEach((item, itemIdx) => {
        const li = document.createElement("li");
        li.className = "item" + (item.checked ? " checked" : "");
        li.innerHTML = `
          <div class="item-checkbox" role="checkbox" aria-checked="${item.checked}" tabindex="0"></div>
          <div class="item-label">${escapeHTML(item.text)}</div>
          <button class="item-delete" aria-label="Delete item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        `;
        const checkbox = li.querySelector(".item-checkbox");
        const label = li.querySelector(".item-label");
        const delBtn = li.querySelector(".item-delete");

        const toggle = () => {
          list.categories[catIdx].items[itemIdx].checked =
            !list.categories[catIdx].items[itemIdx].checked;
          save();
          renderList();
        };
        checkbox.addEventListener("click", toggle);
        label.addEventListener("click", toggle);
        checkbox.addEventListener("keydown", (e) => {
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
        });

        delBtn.addEventListener("click", (e) => {
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

  const { total, done } = getCounts(list);
  progressFill.style.width = total ? `${(done / total) * 100}%` : "0%";
  if (!total) {
    progressText.textContent = "Empty list";
  } else if (done === total) {
    progressText.textContent = "All packed ✓";
  } else {
    progressText.textContent = `${done} of ${total} packed`;
  }
}

// --- Add item ------------------------------------------------------

const addItemForm = document.getElementById("addItemForm");
const newItemInput = document.getElementById("newItemInput");

addItemForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const list = state.lists[state.activeListId];
  if (!list) return;
  const text = newItemInput.value.trim();
  if (!text) return;

  if (list.isCustom) {
    // Custom lists: add to first category (create it if missing)
    if (list.categories.length === 0) {
      list.categories.push({ name: CUSTOM_DEFAULT_CATEGORY, items: [] });
    }
    list.categories[0].items.push({ text, checked: false });
  } else {
    // Template lists: items go in a lazily-created "My additions" section
    let customCat = list.categories.find(c => c.name === CUSTOM_CATEGORY);
    if (!customCat) {
      customCat = { name: CUSTOM_CATEGORY, items: [] };
      list.categories.push(customCat);
    }
    customCat.items.push({ text, checked: false });
  }

  save();
  newItemInput.value = "";
  renderList();
});

// --- List menu -----------------------------------------------------

const listMenuModal = document.getElementById("listMenuModal");
const uncheckAllBtn = document.getElementById("uncheckAllBtn");
const resetBtn = document.getElementById("resetBtn");
const renameBtn = document.getElementById("renameBtn");
const deleteBtn = document.getElementById("deleteBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");

menuBtn.addEventListener("click", () => {
  const list = state.lists[state.activeListId];
  const isCustom = list && list.isCustom;
  resetBtn.classList.toggle("hidden", isCustom);
  renameBtn.classList.toggle("hidden", !isCustom);
  deleteBtn.classList.toggle("hidden", !isCustom);
  listMenuModal.classList.remove("hidden");
});

closeMenuBtn.addEventListener("click", () => listMenuModal.classList.add("hidden"));
listMenuModal.addEventListener("click", (e) => {
  if (e.target === listMenuModal) listMenuModal.classList.add("hidden");
});

uncheckAllBtn.addEventListener("click", () => {
  const list = state.lists[state.activeListId];
  if (!list) return;
  forEachItem(list, (item) => { item.checked = false; });
  save();
  renderList();
  listMenuModal.classList.add("hidden");
});

resetBtn.addEventListener("click", () => {
  if (!confirm("Reset this list to the default items? Anything you've added or removed will be lost.")) return;
  const tpl = getTemplate(state.activeListId);
  if (!tpl) return;
  state.lists[state.activeListId] = freshListFromTemplate(tpl);
  save();
  renderList();
  listMenuModal.classList.add("hidden");
});

renameBtn.addEventListener("click", () => {
  const list = state.lists[state.activeListId];
  if (!list || !list.isCustom) return;
  const newName = prompt("Rename list:", list.name);
  if (newName && newName.trim()) {
    list.name = newName.trim();
    save();
    const meta = getListMeta(state.activeListId);
    headerTitle.textContent = `${meta.emoji} ${meta.name}`;
  }
  listMenuModal.classList.add("hidden");
});

deleteBtn.addEventListener("click", () => {
  const list = state.lists[state.activeListId];
  if (!list || !list.isCustom) return;
  if (!confirm(`Delete "${list.name}"? This cannot be undone.`)) return;
  delete state.lists[state.activeListId];
  save();
  listMenuModal.classList.add("hidden");
  showHome();
});

// --- New list modal ------------------------------------------------

const newListModal = document.getElementById("newListModal");
const newListForm = document.getElementById("newListForm");
const newListNameInput = document.getElementById("newListName");
const cancelNewListBtn = document.getElementById("cancelNewList");
const emojiPicker = document.getElementById("emojiPicker");
let selectedEmoji = "📋";

emojiPicker.querySelectorAll(".emoji-option").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedEmoji = btn.dataset.emoji;
    emojiPicker.querySelectorAll(".emoji-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
});

function openNewListModal() {
  newListForm.reset();
  selectedEmoji = "📋";
  emojiPicker.querySelectorAll(".emoji-option").forEach(b => b.classList.remove("selected"));
  emojiPicker.querySelector('.emoji-option[data-emoji="📋"]').classList.add("selected");
  newListModal.classList.remove("hidden");
  setTimeout(() => newListNameInput.focus(), 100);
}

cancelNewListBtn.addEventListener("click", () => newListModal.classList.add("hidden"));
newListModal.addEventListener("click", (e) => {
  if (e.target === newListModal) newListModal.classList.add("hidden");
});

newListForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = newListNameInput.value.trim();
  if (!name) return;
  const id = "custom-" + uid();
  state.lists[id] = {
    isCustom: true,
    name,
    emoji: selectedEmoji,
    description: "Custom list",
    categories: [{ name: CUSTOM_DEFAULT_CATEGORY, items: [] }],
  };
  save();
  newListModal.classList.add("hidden");
  showList(id);
});

// --- Utils ---------------------------------------------------------

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Init ----------------------------------------------------------

load();
showHome();
