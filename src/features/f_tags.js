let expanded = false;

export function renderTagsUI(container, tagSearchInput, allTags, selectedTags, onTagChange, onTagRenamed = null, onTagDeleted = null) {
    if (!container) return;
    container.innerHTML = "";

    const filterKeyword = tagSearchInput ? tagSearchInput.value.trim().toLowerCase() : "";
    let displayTags = [...allTags];

    if (filterKeyword) {
        displayTags = displayTags.filter(t => t.name.toLowerCase().includes(filterKeyword));
    } else {
        displayTags = displayTags.slice(0, expanded ? 30 : 10);
    }

    displayTags.forEach(tagObj => {
        const isSelected = selectedTags.includes(tagObj.name);
        const tagBtn = document.createElement("button");
        tagBtn.innerText = `${tagObj.name} (${tagObj.count})`;

        // Dùng CSS variable thay vì hardcode màu — dark mode tự apply
        tagBtn.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 12px;
            border: 1px solid ${isSelected ? "var(--primary)" : "var(--border)"};
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
            background: ${isSelected ? "var(--primary)" : "var(--panel)"};
            color: ${isSelected ? "white" : "var(--text)"};
        `;

        // Left click — toggle filter
        // FIX: không mutate array gốc, luôn tạo array mới rồi trả qua callback
        tagBtn.onclick = () => {
            const newSelected = isSelected
                ? selectedTags.filter(t => t !== tagObj.name)
                : [...selectedTags, tagObj.name];
            onTagChange(newSelected);
            renderTagsUI(container, tagSearchInput, allTags, newSelected, onTagChange, onTagRenamed, onTagDeleted);
        };

        // Right click — rename / delete
        tagBtn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showTagContextMenu(e.clientX, e.clientY, tagObj.name, onTagRenamed, onTagDeleted);
        });

        container.appendChild(tagBtn);
    });

    if (!filterKeyword && allTags.length > 10) {
        const toggleBtn = document.createElement("button");
        toggleBtn.innerText = expanded ? "Show less" : "Show more";
        toggleBtn.style.cssText = `
            margin-top: 6px;
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: var(--panel);
            cursor: pointer;
            color: var(--text-secondary);
        `;
        toggleBtn.onclick = () => {
            expanded = !expanded;
            renderTagsUI(container, tagSearchInput, allTags, selectedTags, onTagChange, onTagRenamed, onTagDeleted);
        };
        container.appendChild(toggleBtn);
    }
}

// =============================================
// TAG CONTEXT MENU — right click tag chip
// =============================================
function showTagContextMenu(x, y, tagName, onTagRenamed, onTagDeleted) {
    document.querySelectorAll(".tag-context-menu").forEach(m => m.remove());

    const menu = document.createElement("div");
    menu.className = "tag-context-menu";
    menu.style.cssText = `
        position: fixed; top: ${y}px; left: ${x}px;
        background: var(--panel); border: 1px solid var(--border);
        border-radius: 8px; box-shadow: var(--shadow-md);
        padding: 4px; z-index: 1000; min-width: 180px; font-size: 13px;
        color: var(--text);
    `;

    // Rename
    const renameItem = document.createElement("div");
    renameItem.innerText = `Rename "${tagName}"`;
    renameItem.style.cssText = "padding:9px 12px; cursor:pointer; border-radius:6px;";
    renameItem.onmouseenter = () => renameItem.style.background = "var(--hover)";
    renameItem.onmouseleave = () => renameItem.style.background = "transparent";
    renameItem.onclick = () => {
        menu.remove();
        showRenameModal(tagName, onTagRenamed);
    };

    // Delete
    const deleteItem = document.createElement("div");
    deleteItem.innerText = `Delete "${tagName}" from all books`;
    deleteItem.style.cssText = "padding:9px 12px; cursor:pointer; border-radius:6px; color:var(--danger);";
    deleteItem.onmouseenter = () => deleteItem.style.background = "var(--danger-soft)";
    deleteItem.onmouseleave = () => deleteItem.style.background = "transparent";
    deleteItem.onclick = async () => {
        menu.remove();
        const ok = await window.__TAURI__.dialog.confirm(
            `Remove tag "${tagName}" from all books?`,
            { title: "Delete Tag", kind: "warning" }
        );
        if (ok && typeof onTagDeleted === "function") {
            onTagDeleted(tagName);
        }
    };

    menu.appendChild(renameItem);
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    // Clamp vào viewport sau khi append (mới có offsetWidth/offsetHeight)
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth)  menu.style.left = (x - rect.width)  + "px";
    if (rect.bottom > window.innerHeight) menu.style.top  = (y - rect.height) + "px";

    setTimeout(() => {
        document.addEventListener("click", () => menu.remove(), { once: true });
    }, 0);
}

// =============================================
// RENAME MODAL — inline input vì Tauri k có dialog.prompt
// =============================================
function showRenameModal(oldName, onTagRenamed) {
    document.querySelectorAll(".rename-tag-overlay").forEach(el => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "rename-tag-overlay";
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; z-index:2000;";

    const box = document.createElement("div");
    box.style.cssText = `
        background: var(--panel);
        color: var(--text);
        border-radius: 12px;
        padding: 24px;
        width: 360px;
        box-shadow: var(--shadow-md);
        font-family: inherit;
        border: 1px solid var(--border);
    `;
    box.innerHTML = `
        <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:var(--text);">Rename tag</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Rename "<b>${oldName}</b>" across all books.</div>
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.style.cssText = `
        width: 100%;
        padding: 9px 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        box-sizing: border-box;
        margin-bottom: 16px;
        background: var(--panel);
        color: var(--text);
        transition: border-color 0.15s, box-shadow 0.15s;
    `;
    input.onfocus = () => {
        input.style.borderColor = "var(--primary)";
        input.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.15)";
    };
    input.onblur = () => {
        input.style.borderColor = "var(--border)";
        input.style.boxShadow = "none";
    };

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex; justify-content:flex-end; gap:8px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.cssText = `
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        border-radius: 8px;
        padding: 8px 14px;
        cursor: pointer;
    `;
    cancelBtn.onclick = () => overlay.remove();

    const confirmBtn = document.createElement("button");
    confirmBtn.innerText = "Rename";
    confirmBtn.style.cssText = `
        border: 1px solid var(--primary);
        background: var(--primary);
        color: white;
        border-radius: 8px;
        padding: 8px 14px;
        cursor: pointer;
        font-weight: 600;
    `;
    confirmBtn.onclick = () => {
        const newName = input.value.trim();
        if (newName && newName !== oldName && typeof onTagRenamed === "function") {
            onTagRenamed(oldName, newName);
        }
        overlay.remove();
    };

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") confirmBtn.click();
        if (e.key === "Escape") overlay.remove();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    box.appendChild(input);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Focus và select all để dễ đổi tên
    setTimeout(() => { input.focus(); input.select(); }, 50);
}