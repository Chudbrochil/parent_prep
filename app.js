// ParentPrep — categorized packing lists with localStorage persistence.
// Storage model: { [templateId]: { categories: [{ name, items: [{text, checked}] }] } }

const STORAGE_KEY = "parentprep.v4";
const CUSTOM_CATEGORY = "My additions";

const state = {
  lists: {},
  activeTemplateId: null,
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

function getTemplate(id) {
  return window.TEMPLATES.find(t => t.id === id);
}

function getList(id) {
  return state.lists[id];
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
    state.lists[id] = freshListFromTemplate(getTemplate(id));
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
  state.activeTemplateId = null;
  listScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
  backBtn.classList.add("hidden");
  menuBtn.classList.add("hidden");
  headerTitle.textContent = "ParentPrep";
  document.body.classList.add("on-home");
  document.body.classList.remove("on-list");
  renderHome();
}

function showList(templateId) {
  const tpl = getTemplate(templateId);
  if (!tpl) return;
  ensureList(templateId);
  state.activeTemplateId = templateId;
  homeScreen.classList.add("hidden");
  listScreen.classList.remove("hidden");
  backBtn.classList.remove("hidden");
  menuBtn.classList.remove("hidden");
  headerTitle.textContent = `${tpl.emoji} ${tpl.name}`;
  document.body.classList.add("on-list");
  document.body.classList.remove("on-home");
  renderList();
  window.scrollTo(0, 0);
}

backBtn.addEventListener("click", showHome);

// --- Home: scenario cards ------------------------------------------

const scenarioContainer = document.getElementById("scenarioContainer");

function renderHome() {
  scenarioContainer.innerHTML = "";

  const grid = document.createElement("ul");
  grid.className = "scenario-grid";

  window.TEMPLATES.forEach(tpl => {
    const list = getList(tpl.id);
    let total, done;
    if (list) {
      ({ total, done } = getCounts(list));
    } else {
      total = tpl.categories.reduce((n, c) => n + c.items.length, 0);
      done = 0;
    }

    let progressText, progressClass;
    if (!list) {
      progressText = "Tap to start";
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
      <div class="scenario-icon" aria-hidden="true">${tpl.emoji}</div>
      <div class="scenario-body">
        <div class="scenario-title">${escapeHTML(tpl.name)}</div>
        <div class="scenario-sub">${escapeHTML(tpl.description)}</div>
        <div class="scenario-progress ${progressClass}">${progressText}</div>
      </div>
      <div class="scenario-arrow" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <div class="scenario-card-progress" style="width:${pct}%"></div>
    `;
    card.addEventListener("click", () => showList(tpl.id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showList(tpl.id);
      }
    });
    grid.appendChild(card);
  });

  scenarioContainer.appendChild(grid);
}

// --- List detail rendering -----------------------------------------

const itemListEl = document.getElementById("itemList");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");

function renderList() {
  const list = getList(state.activeTemplateId);
  if (!list) { showHome(); return; }

  itemListEl.innerHTML = "";

  const anyItems = list.categories.some(c => c.items.length > 0);

  if (!anyItems) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No items. Add one below or reset to defaults from the menu.";
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
  const list = getList(state.activeTemplateId);
  if (!list) return;
  const text = newItemInput.value.trim();
  if (!text) return;

  let customCat = list.categories.find(c => c.name === CUSTOM_CATEGORY);
  if (!customCat) {
    customCat = { name: CUSTOM_CATEGORY, items: [] };
    list.categories.push(customCat);
  }
  customCat.items.push({ text, checked: false });
  save();
  newItemInput.value = "";
  renderList();
});

// --- List menu -----------------------------------------------------

const listMenuModal = document.getElementById("listMenuModal");
const uncheckAllBtn = document.getElementById("uncheckAllBtn");
const resetBtn = document.getElementById("resetBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");

menuBtn.addEventListener("click", () => listMenuModal.classList.remove("hidden"));
closeMenuBtn.addEventListener("click", () => listMenuModal.classList.add("hidden"));
listMenuModal.addEventListener("click", (e) => {
  if (e.target === listMenuModal) listMenuModal.classList.add("hidden");
});

uncheckAllBtn.addEventListener("click", () => {
  const list = getList(state.activeTemplateId);
  if (!list) return;
  forEachItem(list, (item) => { item.checked = false; });
  save();
  renderList();
  listMenuModal.classList.add("hidden");
});

resetBtn.addEventListener("click", () => {
  if (!confirm("Reset this list to the default items? Anything you've added or removed will be lost.")) return;
  const tpl = getTemplate(state.activeTemplateId);
  state.lists[state.activeTemplateId] = freshListFromTemplate(tpl);
  save();
  renderList();
  listMenuModal.classList.add("hidden");
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
