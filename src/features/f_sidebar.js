// f_sidebar.js
// Render sidebar folder list
// Dùng CSS classes từ styles.css — không dùng inline styles
// Dark mode tự động theo CSS variables

export function renderSidebar(sidebarContainer, folders, onSelectCallback, onDeleteFolderCallback, books = []) {
  sidebarContainer.innerHTML = "";

  // "All Documents"
  const allDocItem = createSidebarItem({
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    label: "All Documents",
    count: books.filter(b => !b.hidden).length,
    isActive: true,
    path: null
  });
  allDocItem.addEventListener("click", () => {
    setActiveItem(sidebarContainer, allDocItem);
    onSelectCallback(null);
  });
  sidebarContainer.appendChild(allDocItem);

  // Các folder
  folders.forEach((folderPath) => {
    const count = books.filter(b => !b.hidden && isBookInFolder(b.path, folderPath)).length;
    const folderName = folderPath.split('\\').pop() || folderPath.split('/').pop() || folderPath;

    const folderItem = createSidebarItem({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
      label: folderName,
      count: count,
      isActive: false,
      path: folderPath,
      tooltip: folderPath
    });

    folderItem.addEventListener("click", () => {
      setActiveItem(sidebarContainer, folderItem);
      onSelectCallback(folderPath);
    });

    folderItem.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showFolderContextMenu(e.clientX, e.clientY, folderPath, onDeleteFolderCallback);
    });

    sidebarContainer.appendChild(folderItem);
  });
}

// Tạo 1 item — dùng CSS class, không inline style
function createSidebarItem({ icon, label, count, isActive, path, tooltip }) {
  const item = document.createElement("div");
  item.className = "sidebar-item" + (isActive ? " active" : "");
  item.dataset.path = path === null ? "all" : path;
  if (tooltip) item.title = tooltip;

  item.innerHTML = `
    <span class="sidebar-label" style="display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;">
      ${icon}
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span>
    </span>
    <span class="sidebar-count">${count}</span>
  `;

  return item;
}

function setActiveItem(container, activeItem) {
  container.querySelectorAll(".sidebar-item").forEach(item => {
    item.classList.remove("active");
  });
  activeItem.classList.add("active");
}

// Context menu right-click folder
function showFolderContextMenu(x, y, folderPath, onDeleteCallback) {
  document.querySelectorAll(".context-menu").forEach(m => m.remove());

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.cssText = `position:fixed; top:${y}px; left:${x}px; z-index:10000;`;

  const deleteItem = document.createElement("div");
  deleteItem.style.cssText = "padding:9px 12px; cursor:pointer; border-radius:6px; color:var(--danger); display:flex; align-items:center; gap:8px;";
  deleteItem.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
    Remove folder from library
  `;
  deleteItem.onmouseenter = () => deleteItem.style.background = "var(--danger-soft)";
  deleteItem.onmouseleave = () => deleteItem.style.background = "transparent";
  deleteItem.onclick = async () => {
    menu.remove();
    const ok = await window.__TAURI__.dialog.confirm(
      `Remove this folder from library?\n\n${folderPath}\n\n(Books stay until you click Update Database)`,
      { title: "Remove folder", kind: "warning" }
    );
    if (ok) onDeleteCallback(folderPath);
  };

  menu.appendChild(deleteItem);
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener("click", () => menu.remove(), { once: true });
  }, 0);
}

function isBookInFolder(bookPath, folderPath) {
  const normalizedFolder = folderPath.replace(/[\\/]+$/, "");
  return bookPath.startsWith(normalizedFolder + "\\") || bookPath.startsWith(normalizedFolder + "/");
}