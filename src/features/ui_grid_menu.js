import { api } from "./api.js";

// =============================================
// CONTEXT MENU — hiện khi right click 1 card
//
// Params:
//   x, y          — tọa độ mouse
//   book          — BookEntry đang right click
//   onUpdateSuccess — callback sau khi action xong
//   viewMode      — "library" | "trash"
//   selectedBooks — Set<path> từ main.js
//                   Nếu size > 1 và book.path trong set
//                   → đổi "Edit name & Tags" thành "Edit tags (X books)"
// =============================================
export function showCardContextMenu(x, y, book, onUpdateSuccess, viewMode = "library", selectedBooks = new Set()) {
  document.querySelectorAll(".context-menu").forEach(m => m.remove());

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `
    position: fixed;
    top: ${y}px;
    left: ${x}px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow-md);
    padding: 4px;
    z-index: 1000;
    min-width: 220px;
    font-size: 13px;
    color: var(--text);
  `;

  const folderPath = getFolderPath(book.path);

  // Nếu đang chọn nhiều sách VÀ sách này nằm trong selection → bulk mode
  const isBulk = selectedBooks.size > 1 && selectedBooks.has(book.path);

  const items = [
    {
      label: "Open PDF",
      action: async () => await window.__TAURI__.opener.openPath(book.path)
    },
    {
      label: "Open Location",
      action: async () => await api.revealInExplorer(book.path)
    },
    viewMode === "trash"
      ? {
          label: "Restore",
          action: async () => {
            if (window.__APP_ACTIONS__?.restoreBook) {
              await window.__APP_ACTIONS__.restoreBook(book.path);
            }
            if (typeof onUpdateSuccess === "function") await onUpdateSuccess();
          }
        }
      : {
          label: "Hide from library",
          action: async () => {
            if (window.__APP_ACTIONS__?.hideBook) {
              await window.__APP_ACTIONS__.hideBook(book.path);
            }
            if (typeof onUpdateSuccess === "function") await onUpdateSuccess();
          }
        },
    // Single → "Edit name & Tags" | Bulk → "Edit tags (X books)"
    isBulk
      ? {
          label: `Edit tags (${selectedBooks.size} books)`,
          action: () => openBulkTagModal([...selectedBooks], onUpdateSuccess)
        }
      : {
          label: "Edit name & Tags",
          action: () => openEditModal(book, onUpdateSuccess)
        }
  ];

  items.forEach(({ label, action }) => {
    const item = document.createElement("div");
    item.innerText = label;
    item.style.cssText = `
      padding: 9px 12px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;
    `;
    item.onmouseenter = () => item.style.background = "var(--hover)";
    item.onmouseleave = () => item.style.background = "transparent";
    item.onclick = async () => {
      menu.remove();
      await action();
    };
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  // Clamp vào viewport — tránh menu bị cắt ở mép phải / mép dưới
  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  menu.style.left = (x - rect.width)  + "px";
  if (rect.bottom > window.innerHeight) menu.style.top  = (y - rect.height) + "px";

  setTimeout(() => {
    document.addEventListener("click", () => menu.remove(), { once: true });
  }, 0);
}

// Lấy đường dẫn folder chứa file
function getFolderPath(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return null;
  return filePath.slice(0, idx);
}

// =============================================
// BULK TAG MODAL — edit tags cho nhiều sách cùng lúc
//
// Logic add/remove:
//   - Tags nhập vào sẽ được ADD vào tất cả sách (không xóa tags cũ)
//   - Tags bấm Remove sẽ bị XÓA khỏi tất cả sách
//   - Cho phép thấy rõ đang add gì, remove gì trước khi apply
// =============================================
function openBulkTagModal(paths, onSave) {
    document.querySelectorAll(".edit-book-overlay").forEach(el => el.remove());

    let tagsToAdd = [];    // Tags sẽ được add vào tất cả sách
    let tagsToRemove = []; // Tags sẽ bị xóa khỏi tất cả sách

    const overlay = document.createElement("div");
    overlay.className = "edit-book-overlay";
    overlay.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
        z-index: 2000; padding: 20px;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
        width: min(640px, 100%);
        background: var(--panel);
        color: var(--text);
        border-radius: 14px;
        box-shadow: var(--shadow-md);
        overflow: hidden;
        font-family: inherit;
        border: 1px solid var(--border);
    `;

    // --- Header ---
    const header = document.createElement("div");
    header.style.cssText = `
        padding: 16px 18px 12px;
        border-bottom: 1px solid var(--border);
        display: flex; align-items: center;
        justify-content: space-between; gap: 12px;
    `;

    const titleWrap = document.createElement("div");
    titleWrap.innerHTML = `
        <div style="font-size:18px;font-weight:700;color:var(--text);">Edit tags — ${paths.length} books</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
          Add tags: added to all books. Remove tags: removed from all books.
        </div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "x";
    closeBtn.style.cssText = `
        border:none; background:var(--hover);
        color:var(--text);
        width:34px; height:34px; border-radius:999px;
        cursor:pointer; font-size:14px;
    `;

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    // --- Body ---
    const body = document.createElement("div");
    body.style.cssText = "padding:18px; display:flex; flex-direction:column; gap:16px;";

    // --- Add tags section ---
    const addBlock = document.createElement("div");
    addBlock.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text);">Add tags to all</div>`;

    const addEditor = createTagEditor(tagsToAdd, "#eef4ff", "#1d4ed8", "#cfe0ff");
    addBlock.appendChild(addEditor.wrap);
    addBlock.appendChild(addEditor.helper("Enter to add. These tags will be added to all selected books."));

    // --- Remove tags section ---
    const removeBlock = document.createElement("div");
    removeBlock.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:#c00;">Remove tags from all</div>`;

    const removeEditor = createTagEditor(tagsToRemove, "#fff0f0", "#c00", "#ffd0d0");
    removeBlock.appendChild(removeEditor.wrap);
    removeBlock.appendChild(removeEditor.helper("Enter to add. These tags will be removed from all selected books."));

    body.appendChild(addBlock);
    body.appendChild(removeBlock);

    // --- Footer ---
    const footer = document.createElement("div");
    footer.style.cssText = `
        padding:14px 18px; border-top:1px solid var(--border);
        display:flex; justify-content:flex-end; gap:10px; background:var(--panel-soft);
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.cssText = "border:1px solid var(--border); background:var(--panel); color:var(--text); border-radius:8px; padding:9px 14px; cursor:pointer;";

    const saveBtn = document.createElement("button");
    saveBtn.innerText = `Apply to ${paths.length} books`;
    saveBtn.style.cssText = "border:1px solid var(--primary); background:var(--primary); color:white; border-radius:8px; padding:9px 16px; cursor:pointer; font-weight:600;";

    // --- Save logic ---
    async function handleSave() {
        // Flush input chưa confirm
        addEditor.flush();
        removeEditor.flush();

        if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
            overlay.remove();
            return;
        }

        saveBtn.disabled = true;
        saveBtn.innerText = "Applying...";

        let successCount = 0;
        for (const path of paths) {
            try {
                // Lấy book hiện tại từ state để biết tags hiện có
                // Dùng __APP_ACTIONS__.getBook nếu có, không thì dùng api.getBooks
                // Cách đơn giản: gọi updateBook với tags đã merge
                const books = await api.getBooks();
                const book = books.find(b => b.path === path);
                if (!book) continue;

                // Merge: giữ tags cũ + add mới + xóa remove
                let merged = [...book.tags];
                for (const t of tagsToAdd) {
                    if (!merged.some(x => x.toLowerCase() === t.toLowerCase())) {
                        merged.push(t);
                    }
                }
                merged = merged.filter(t =>
                    !tagsToRemove.some(r => r.toLowerCase() === t.toLowerCase())
                );

                await api.updateBook(path, book.file_name, merged);
                successCount++;
            } catch (err) {
                console.error("Bulk tag error:", path, err);
            }
        }

        overlay.remove();
        if (typeof onSave === "function") onSave();
    }

    cancelBtn.onclick = () => overlay.remove();
    closeBtn.onclick  = () => overlay.remove();
    saveBtn.onclick   = handleSave;

    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); }
    }, { once: true });

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// Helper tạo tag editor tái sử dụng được cho cả Add và Remove section
function createTagEditor(tagList, bgColor, textColor, borderColor) {
    const wrap = document.createElement("div");
    wrap.style.cssText = `
        border:1px solid var(--border); border-radius:10px; padding:8px;
        min-height:52px; display:flex; flex-wrap:wrap;
        align-items:center; gap:8px; background:var(--panel);
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type a tag and press Enter...";
    input.style.cssText = `
        border:none; outline:none; flex:1; min-width:180px;
        font-size:14px; padding:6px 2px; background:transparent;
        color:var(--text);
    `;

    function normalize(tag) { return tag.trim().replace(/\s+/g, " "); }

    function renderChips() {
        wrap.innerHTML = "";
        tagList.forEach((tag, index) => {
            const chip = document.createElement("span");
            chip.style.cssText = `
                display:inline-flex; align-items:center; gap:6px;
                background:${bgColor}; border:1px solid ${borderColor};
                color:${textColor}; border-radius:999px;
                padding:6px 10px; font-size:12px; line-height:1;
            `;
            const text = document.createElement("span");
            text.innerText = tag;
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.innerText = "x";
            removeBtn.style.cssText = `border:none; background:transparent; color:${textColor}; font-size:14px; font-weight:bold; cursor:pointer; padding:0; line-height:1;`;
            removeBtn.onclick = () => { tagList.splice(index, 1); renderChips(); };
            chip.appendChild(text);
            chip.appendChild(removeBtn);
            wrap.appendChild(chip);
        });
        wrap.appendChild(input);
        input.focus();
    }

    function addTag(raw) {
        const tag = normalize(raw);
        if (!tag) return;
        if (tagList.some(t => t.toLowerCase() === tag.toLowerCase())) { input.value = ""; return; }
        tagList.push(tag);
        input.value = "";
        renderChips();
    }

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(input.value); }
        else if (e.key === "Backspace" && !input.value.trim() && tagList.length > 0) {
            tagList.pop(); renderChips();
        }
    });
    input.addEventListener("blur", () => { if (input.value.trim()) addTag(input.value); });

    wrap.appendChild(input);

    return {
        wrap,
        helper: (text) => {
            const el = document.createElement("div");
            el.style.cssText = "font-size:12px; color:var(--text-secondary); margin-top:6px;";
            el.innerText = text;
            return el;
        },
        flush: () => { if (input.value.trim()) addTag(input.value); }
    };
}

// =============================================
// SINGLE EDIT MODAL — sửa tên + tags 1 sách
// =============================================
function openEditModal(book, onSave) {
    document.querySelectorAll(".edit-book-overlay").forEach(el => el.remove());

    let currentName = book.file_name || "";
    let currentTags = Array.isArray(book.tags) ? [...book.tags] : [];

    const overlay = document.createElement("div");
    overlay.className = "edit-book-overlay";
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.35);
        display:flex; align-items:center; justify-content:center;
        z-index:2000; padding:20px;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
        width:min(640px,100%); background:var(--panel); color:var(--text); border-radius:14px;
        box-shadow:var(--shadow-md); overflow:hidden; font-family:inherit;
        border:1px solid var(--border);
    `;

    const header = document.createElement("div");
    header.style.cssText = `
        padding:16px 18px 12px; border-bottom:1px solid var(--border);
        display:flex; align-items:center; justify-content:space-between; gap:12px;
    `;

    const titleWrap = document.createElement("div");
    titleWrap.innerHTML = `
        <div style="font-size:18px;font-weight:700;color:var(--text);">Edit name & Tags</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Click x on a chip to remove a tag.</div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "x";
    closeBtn.style.cssText = "border:none; background:var(--hover); color:var(--text); width:34px; height:34px; border-radius:999px; cursor:pointer; font-size:14px;";

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.style.cssText = "padding:18px; display:flex; flex-direction:column; gap:16px;";

    const nameBlock = document.createElement("div");
    nameBlock.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text);">File name</div>`;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = currentName;
    nameInput.style.cssText = "width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px; outline:none; box-sizing:border-box; background:var(--panel); color:var(--text);";
    nameBlock.appendChild(nameInput);

    const tagBlock = document.createElement("div");
    tagBlock.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text);">Tags</div>`;

    const tagEditor = document.createElement("div");
    tagEditor.style.cssText = "border:1px solid var(--border); border-radius:10px; padding:8px; min-height:52px; display:flex; flex-wrap:wrap; align-items:center; gap:8px; background:var(--panel);";

    const tagInput = document.createElement("input");
    tagInput.type = "text";
    tagInput.placeholder = "Type a tag and press Enter...";
    tagInput.style.cssText = "border:none; outline:none; flex:1; min-width:180px; font-size:14px; padding:6px 2px; background:transparent; color:var(--text);";

    const helper = document.createElement("div");
    helper.style.cssText = "font-size:12px;color:var(--text-secondary);margin-top:6px;";
    helper.innerText = "Enter to add a tag. Backspace on empty input to remove last tag.";

    const footer = document.createElement("div");
    footer.style.cssText = "padding:14px 18px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px; background:var(--panel-soft);";

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.cssText = "border:1px solid var(--border); background:var(--panel); color:var(--text); border-radius:8px; padding:9px 14px; cursor:pointer;";

    const saveBtn = document.createElement("button");
    saveBtn.innerText = "Save";
    saveBtn.style.cssText = "border:1px solid var(--primary); background:var(--primary); color:white; border-radius:8px; padding:9px 16px; cursor:pointer; font-weight:600;";

    function normalizeTag(tag) { return tag.trim().replace(/\s+/g, " "); }

    function renderTagChips() {
        tagEditor.innerHTML = "";
        currentTags.forEach((tag, index) => {
            const chip = document.createElement("span");
            chip.style.cssText = "display:inline-flex; align-items:center; gap:6px; background:var(--primary-soft); border:1px solid var(--primary); color:var(--primary); border-radius:999px; padding:6px 10px; font-size:12px; line-height:1;";
            const text = document.createElement("span");
            text.innerText = tag;
            text.style.cssText = "max-width:180px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;";
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.innerText = "x";
            removeBtn.title = `Remove tag: ${tag}`;
            removeBtn.style.cssText = "border:none; background:transparent; color:var(--primary); font-size:14px; font-weight:bold; cursor:pointer; padding:0; line-height:1;";
            removeBtn.onclick = () => { currentTags.splice(index, 1); renderTagChips(); };
            chip.appendChild(text);
            chip.appendChild(removeBtn);
            tagEditor.appendChild(chip);
        });
        tagEditor.appendChild(tagInput);
        tagInput.focus();
    }

    function addTag(rawValue) {
        const tag = normalizeTag(rawValue);
        if (!tag) return;
        if (currentTags.some(t => t.toLowerCase() === tag.toLowerCase())) { tagInput.value = ""; return; }
        currentTags.push(tag);
        tagInput.value = "";
        renderTagChips();
    }

    tagInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput.value); }
        else if (e.key === "Backspace" && !tagInput.value.trim() && currentTags.length > 0) {
            currentTags.pop(); renderTagChips();
        }
    });
    tagInput.addEventListener("blur", () => { if (tagInput.value.trim()) addTag(tagInput.value); });

    async function handleSave() {
        try {
            const newName = nameInput.value.trim() || book.file_name;
            const cleanTags = currentTags.map(normalizeTag).filter(Boolean)
                .filter((tag, index, arr) => arr.findIndex(t => t.toLowerCase() === tag.toLowerCase()) === index);
            saveBtn.disabled = true;
            saveBtn.innerText = "Saving...";
            await api.updateBook(book.path, newName, cleanTags);
            overlay.remove();
            if (typeof onSave === "function") onSave();
        } catch (err) {
            alert("Error updating book: " + err);
            saveBtn.disabled = false;
            saveBtn.innerText = "Save";
        }
    }

    cancelBtn.onclick = () => overlay.remove();
    closeBtn.onclick  = () => overlay.remove();
    saveBtn.onclick   = handleSave;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); }
    }, { once: true });

    tagEditor.appendChild(tagInput);
    tagBlock.appendChild(tagEditor);
    tagBlock.appendChild(helper);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    body.appendChild(nameBlock);
    body.appendChild(tagBlock);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    renderTagChips();
}