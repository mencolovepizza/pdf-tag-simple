import { api } from "./features/api.js";
import { renderSidebar } from "./features/f_sidebar.js";
import { renderAssetGrid, updateCardSelectionVisual, getShiftSelectRange, getBookIndex, setLastClickedIndex, getLastClickedIndex, getFilteredPaths } from "./features/f_grid.js";
import { renderTagsUI } from "./features/f_tags.js";
import { pickLibraryFolder } from "./features/f_addfolder.js";
import { openAiSettings, openAiAutoTag } from "./features/f_ai.js";
import { openDuplicates } from "./features/f_duplicates.js";

// ==========================================
// STATE
// ==========================================
let state = {
    books: [],               // Toàn bộ sách (cả hidden) — lấy từ backend
    tags: [],                // Tags để render sidebar (chỉ của sách không hidden)
    selectedTags: [],        // Tags đang filter
    currentFilterPath: null, // Folder đang chọn trong sidebar
    currentSearch: "",       // Nội dung ô tìm kiếm
    currentSort: "name-asc", // Kiểu sắp xếp
    viewMode: "library",     // "library" | "trash"
    selectedBooks: new Set() // Set<path> — sách đang được multi-select
    
};
window.__DEBUG_STATE__ = state;
// ==========================================
// MAIN
// ==========================================
window.addEventListener("DOMContentLoaded", async () => {

    // --- DOM Elements ---
    const sidebarContainer    = document.querySelector("#sidebar-folders");
    const assetGridContainer  = document.querySelector("#asset-grid");
    const tagContainer        = document.querySelector("#tag-list-container");
    const tagSearchInput      = document.querySelector("#tag-search-input");
    const txtStatus           = document.querySelector("#txt-status");
    const searchInput         = document.querySelector("#search-input");
    const sortSelect          = document.querySelector("#sort-select");

    // Toolbar buttons
    const btnSelectFolder     = document.querySelector("#btn-select-folder");
    const btnUpdateDB         = document.querySelector("#btn-update-db");
    const btnExport           = document.querySelector("#btn-export");
    const btnImport           = document.querySelector("#btn-import");
    const btnAiAutoTag        = document.querySelector("#btn-ai-autotag");
    const btnAiSettings       = document.querySelector("#btn-ai-settings");
    const btnFindDuplicates   = document.querySelector("#btn-find-duplicates");
    const btnThemeToggle      = document.querySelector("#btn-theme-toggle");

    // Selection + trash buttons
    const btnTrashView        = document.querySelector("#btn-trash-view");
    const txtTrashCount       = document.querySelector("#txt-trash-count");
    const txtSelectionCount   = document.querySelector("#txt-selection-count");
    const btnBulkHide         = document.querySelector("#btn-bulk-hide");
    const btnBulkRestore      = document.querySelector("#btn-bulk-restore");
    const btnClearSelection   = document.querySelector("#btn-clear-selection");
    const btnSelectAll        = document.querySelector("#btn-select-all");

    // Progress bar elements (trong #txt-status area)
    // Tạo sẵn 1 lần, ẩn đi, chỉ hiện khi đang scan
    const progressWrap = document.createElement("div");
    progressWrap.style.cssText = "margin-top:6px; display:none;";

    const progressBar = document.createElement("div");
    progressBar.style.cssText = `
        height: 6px;
        background: var(--border);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 4px;
    `;
    const progressFill = document.createElement("div");
    progressFill.style.cssText = `
        height: 100%;
        width: 0%;
        background: var(--primary);
        border-radius: 3px;
        transition: width 0.2s ease;
    `;

    progressBar.appendChild(progressFill);

    const progressText = document.createElement("div");
    progressText.style.cssText = "font-size:11px; color:var(--text-secondary);";

    progressWrap.appendChild(progressBar);
    progressWrap.appendChild(progressText);

    // Gắn progress bar vào ngay sau txtStatus
    if (txtStatus && txtStatus.parentNode) {
        txtStatus.parentNode.insertBefore(progressWrap, txtStatus.nextSibling);
    }

    // ==========================================
    // PROGRESS BAR — lắng nghe event từ backend
    // Backend emit "scan_progress" sau mỗi thumbnail render
    // Payload: { current, total, file_name, done }
    // ==========================================
    const { listen } = window.__TAURI__.event;

    listen("scan_progress", (event) => {
        const { current, total, file_name, done } = event.payload;

        if (done || total === 0) {
            // Hoàn thành — ẩn progress bar
            progressFill.style.width = "100%";
            setTimeout(() => {
                progressWrap.style.display = "none";
                progressFill.style.width = "0%";
            }, 800);
            return;
        }

        // Hiện progress bar
        progressWrap.style.display = "";

        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        progressFill.style.width = pct + "%";
        progressText.innerText = `Rendering thumbnails: ${current}/${total} — ${file_name}`;
    });

    // ==========================================
    // APP ACTIONS — đăng ký để ui_grid_menu.js gọi
    // ==========================================
    window.__APP_ACTIONS__ = {
        hideBook: async (path) => {
            await api.hideBook(path);
            await refreshUi();
            setStatus("Book hidden.", "gray");
        },
        restoreBook: async (path) => {
            await api.restoreBook(path);
            await refreshUi();
            setStatus("Book restored.", "green");
        },
        // Gọi từ ui_grid_card.js sau khi toggle star
        // Chỉ re-sort grid, không reload toàn bộ (không gọi refreshUi)
        // book.starred đã được update local trong card trước khi gọi đây
        onStarToggled: (path, newState) => {
            // Chỉ update local state — không re-render grid
            // Starred books sẽ lên đầu lần sau vào folder hoặc refresh
            const book = state.books.find(b => b.path === path);
            if (book) book.starred = newState;
        },
    };

    // ==========================================
    // MULTI-SELECT
    // ==========================================

    // Toggle select 1 sách
    // Nếu shiftKey = true → select range từ lastClickedIndex đến index hiện tại
    function toggleSelectBook(path, shiftKey = false) {
        const currentIndex = getBookIndex(path);

        if (shiftKey && getLastClickedIndex() >= 0) {
            // Shift+click → select tất cả cards trong range
            const rangePaths = getShiftSelectRange(getLastClickedIndex(), currentIndex);
            rangePaths.forEach(p => {
                state.selectedBooks.add(p);
                updateCardSelectionVisual(p, true);
            });
        } else {
            // Click thường → toggle 1 card
            if (state.selectedBooks.has(path)) {
                state.selectedBooks.delete(path);
                updateCardSelectionVisual(path, false);
            } else {
                state.selectedBooks.add(path);
                updateCardSelectionVisual(path, true);
            }
            setLastClickedIndex(currentIndex);
        }

        updateSelectionUI();
    }

    // Chọn tất cả sách đang hiện trong grid (respect filter/search/tag hiện tại)
    function selectAllVisible() {
        getFilteredPaths().forEach(p => state.selectedBooks.add(p));
        updateGrid();
        updateSelectionUI();
    }

    // Bỏ chọn tất cả
    function clearSelection() {
        state.selectedBooks.clear();
        updateGrid();
        updateSelectionUI();
    }

    // Cập nhật text count + ẩn/hiện nút bulk action
    function updateSelectionUI() {
        const count = state.selectedBooks.size;
        if (txtSelectionCount) txtSelectionCount.innerText = `${count} selected`;

        const hasSelection = count > 0;
        if (btnBulkHide)       btnBulkHide.style.display       = (hasSelection && state.viewMode === "library") ? "" : "none";
        if (btnBulkRestore)    btnBulkRestore.style.display    = (hasSelection && state.viewMode === "trash")   ? "" : "none";
        if (btnClearSelection) btnClearSelection.style.display = hasSelection ? "" : "none";
    }

    if (btnBulkHide) {
        btnBulkHide.addEventListener("click", async () => {
            if (state.selectedBooks.size === 0) return;
            const paths = [...state.selectedBooks];
            for (const path of paths) await api.hideBook(path);
            state.selectedBooks.clear();
            await refreshUi();
            setStatus(`${paths.length} book(s) hidden.`, "gray");
        });
    }

    if (btnBulkRestore) {
        btnBulkRestore.addEventListener("click", async () => {
            if (state.selectedBooks.size === 0) return;
            const paths = [...state.selectedBooks];
            for (const path of paths) await api.restoreBook(path);
            state.selectedBooks.clear();
            await refreshUi();
            setStatus(`${paths.length} book(s) restored.`, "green");
        });
    }

    if (btnSelectAll)      btnSelectAll.addEventListener("click", selectAllVisible);
    if (btnClearSelection) btnClearSelection.addEventListener("click", clearSelection);

    // ==========================================
    // THÙNG RÁC
    // ==========================================
    function updateTrashButton() {
        const count = state.books.filter(b => b.hidden).length;
        if (txtTrashCount) txtTrashCount.innerText = count;

        if (btnTrashView) {
            if (count > 0) {
                btnTrashView.disabled = false;
                btnTrashView.style.cursor = "pointer";
                btnTrashView.style.color = "";
                btnTrashView.style.opacity = "1";
            } else {
                if (state.viewMode === "trash") switchToLibrary();
                btnTrashView.disabled = true;
                btnTrashView.style.cursor = "not-allowed";
                btnTrashView.style.color = "var(--text-secondary)";
                btnTrashView.style.opacity = "0.6";
            }
        }
    }

    function switchToTrash() {
        state.viewMode = "trash";
        state.currentFilterPath = null;
        state.selectedTags = [];
        state.selectedBooks.clear();
        if (btnTrashView) {
            btnTrashView.style.background = "var(--danger-soft)";
            btnTrashView.style.borderColor = "var(--danger)";
            btnTrashView.style.color = "var(--danger)";
        }
        updateSelectionUI();
        updateGrid();
    }

    function switchToLibrary() {
        state.viewMode = "library";
        state.selectedBooks.clear();
        if (btnTrashView) {
            btnTrashView.style.background = "";
            btnTrashView.style.borderColor = "";
            btnTrashView.style.color = "";
        }
        updateSelectionUI();
        updateGrid();
    }

    if (btnTrashView) {
        btnTrashView.addEventListener("click", () => {
            if (state.viewMode === "trash") switchToLibrary();
            else switchToTrash();
        });
    }

    // ==========================================
    // SIDEBAR CALLBACKS
    // ==========================================
    const handleFolderSelection = (path) => {
        if (state.viewMode === "trash") switchToLibrary();
        state.currentFilterPath = path;
        state.selectedBooks.clear(); // Reset selection khi đổi folder
        updateSelectionUI();
        updateGrid();
    };

    const handleDeleteFolder = async (folderPath) => {
        try {
            await api.removeFolder(folderPath);
            await refreshUi();
            setStatus("Folder removed.", "green");
        } catch (err) {
            alert("Error removing folder: " + err);
        }
    };

    // ==========================================
    // TOOLBAR BUTTONS
    // ==========================================
    if (btnSelectFolder) {
        btnSelectFolder.addEventListener("click", async () => {
            const folder = await pickLibraryFolder(txtStatus);
            if (folder) {
                try {
                    await api.addFolder(folder);
                    await refreshUi();
                    setStatus(`Folder added: ${folder}`, "green");
                } catch (err) {
                    setStatus("Error adding folder: " + err, "red");
                }
            }
        });
    }

    if (btnUpdateDB) {
        btnUpdateDB.addEventListener("click", async () => {
            setStatus("Updating database...", "orange");
            progressWrap.style.display = "";
            progressFill.style.width = "0%";
            progressText.innerText = "Scanning files...";
            btnUpdateDB.disabled = true;
            try {
                const result = await api.updateDatabase();
                await refreshUi();
                setStatus(result, "green");
            } catch (err) {
                setStatus("Error: " + err, "red");
                progressWrap.style.display = "none";
            } finally {
                btnUpdateDB.disabled = false;
            }
        });
    }

    if (btnExport) {
        btnExport.addEventListener("click", async () => {
            try {
                const savePath = await window.__TAURI__.dialog.save({
                    title: "Export Database",
                    defaultPath: "pdf_library_backup.json",
                    filters: [{ name: "JSON Backup", extensions: ["json"] }]
                });
                if (savePath) {
                    const result = await api.exportDB(savePath);
                    setStatus(result, "green");
                }
            } catch (err) {
                setStatus("Export error: " + err, "red");
            }
        });
    }

    if (btnImport) {
        btnImport.addEventListener("click", async () => {
            try {
                const srcPath = await window.__TAURI__.dialog.open({
                    title: "Import Database",
                    multiple: false,
                    filters: [{ name: "JSON Backup", extensions: ["json"] }]
                });
                if (srcPath) {
                    const result = await api.importDB(srcPath);
                    await refreshUi();
                    setStatus(result, "green");
                }
            } catch (err) {
                setStatus("Import error: " + err, "red");
            }
        });
    }

    if (btnAiSettings) {
        btnAiSettings.addEventListener("click", () => openAiSettings());
    }

    // ==========================================
    // DARK MODE TOGGLE
    // Lưu preference vào localStorage
    // ==========================================
    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        if (btnThemeToggle) {
            btnThemeToggle.innerText = theme === "dark" ? "☀️" : "🌙";
            btnThemeToggle.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
        }
        localStorage.setItem("theme", theme);
    }

    // Load saved theme on startup
    const savedTheme = localStorage.getItem("theme") || "light";
    applyTheme(savedTheme);

    if (btnThemeToggle) {
        btnThemeToggle.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            applyTheme(current === "dark" ? "light" : "dark");
        });
    }

    if (btnFindDuplicates) {
        btnFindDuplicates.addEventListener("click", () => {
            openDuplicates(() => refreshUi());
        });
    }

    if (btnAiAutoTag) {
        btnAiAutoTag.addEventListener("click", () => {
            const visibleBooks = state.books.filter(b => !b.hidden);
            openAiAutoTag(
                visibleBooks,
                state.selectedBooks,
                state.currentFilterPath,
                () => refreshUi()
            );
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            state.currentSearch = searchInput.value;
            updateGrid();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener("change", () => {
            state.currentSort = sortSelect.value;
            updateGrid();
        });
    }

    if (tagSearchInput) {
        tagSearchInput.addEventListener("input", () => {
            renderTagsUI(tagContainer, tagSearchInput, state.tags, state.selectedTags, (newTags) => {
                state.selectedTags = newTags;
                updateGrid();
            }, handleTagRenamed, handleTagDeleted);
        });
    }

    // ==========================================
    // TAG MANAGEMENT CALLBACKS
    // ==========================================
    async function handleTagRenamed(oldName, newName) {
        try {
            await api.renameTag(oldName, newName);
            await refreshUi();
            setStatus(`Tag "${oldName}" renamed to "${newName}".`, "green");
        } catch (err) {
            setStatus("Error renaming tag: " + err, "red");
        }
    }

    async function handleTagDeleted(tagName) {
        try {
            await api.deleteTag(tagName);
            await refreshUi();
            setStatus(`Tag "${tagName}" deleted from all books.`, "gray");
        } catch (err) {
            setStatus("Error deleting tag: " + err, "red");
        }
    }

    // ==========================================
    // CORE FUNCTIONS
    // ==========================================
    async function refreshUi() {
        state.books = await api.getBooks();
        state.tags  = await api.getTags();
        const paths = await api.getFolders();

        renderSidebar(sidebarContainer, paths, handleFolderSelection, handleDeleteFolder, state.books);
        renderTagsUI(tagContainer, tagSearchInput, state.tags, state.selectedTags, (newTags) => {
            state.selectedTags = newTags;
            updateGrid();
        }, handleTagRenamed, handleTagDeleted);

        updateTrashButton();
        updateSelectionUI();
        updateGrid();
    }

    function updateGrid() {
        const visibleBooks = state.viewMode === "trash"
            ? state.books.filter(b => b.hidden)
            : state.books.filter(b => !b.hidden);

        renderAssetGrid(
            assetGridContainer,
            visibleBooks,
            state.currentFilterPath,
            state.currentSearch,
            state.currentSort,
            state.selectedTags,
            () => refreshUi(),
            state.viewMode,
            state.selectedBooks,
            (path, shiftKey) => toggleSelectBook(path, shiftKey)
        );
    }

    function setStatus(msg, color = "inherit") {
        if (txtStatus) {
            txtStatus.innerText = msg;
            txtStatus.style.color = color;
        }
    }

    // ==========================================
    // KEYBOARD SHORTCUTS
    // ==========================================
    document.addEventListener("keydown", (e) => {
        // Bỏ qua khi đang focus vào input/textarea
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

        // Escape — bỏ chọn tất cả
        if (e.key === "Escape") {
            clearSelection();
        }

        // Ctrl/Cmd + A — chọn tất cả đang hiện
        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            selectAllVisible();
        }

        // Ctrl/Cmd + F — focus ô tìm kiếm
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            searchInput?.focus();
            searchInput?.select();
        }
    });

    // ==========================================
    // KHOI CHAY
    // ==========================================
    await refreshUi();
});