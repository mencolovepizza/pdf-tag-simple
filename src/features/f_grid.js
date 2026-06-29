import { createCard } from "./ui_grid_card.js";
import { showCardContextMenu } from "./ui_grid_menu.js";

// =============================================
// GRID STATE — giữ trạng thái giữa các batch
// =============================================
let observer = null;

let gridState = {
    container: null,
    filteredBooks: [],
    displayCount: 0,
    pageSize: 50,
    viewMode: "library",
    cardMap: {},
    lastClickedIndex: -1  // Lưu index card click lần trước để shift select
};

export function renderAssetGrid(
    container, books, filterPath, search, sort, selectedTags,
    onGridUpdate, viewMode = "library",
    selectedBooks = new Set(), onToggleSelect = null
) {
    if (observer) observer.disconnect();

    gridState.container = container;
    gridState.filteredBooks = applyFilters(books, filterPath, search, sort, selectedTags);
    gridState.displayCount = 0;
    gridState.viewMode = viewMode;
    gridState.cardMap = {};
    gridState.lastClickedIndex = -1;
    container.innerHTML = "";

    if (gridState.filteredBooks.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "padding:24px; color:var(--text-secondary); font-size:14px;";
        empty.innerText = viewMode === "trash" ? "Trash is empty." : "No books found.";
        container.appendChild(empty);
        return;
    }

    renderNextBatch(onGridUpdate, selectedBooks, onToggleSelect);
}

function renderNextBatch(onGridUpdate, selectedBooks, onToggleSelect) {
    const { container, filteredBooks, displayCount, pageSize, viewMode } = gridState;
    const end = Math.min(displayCount + pageSize, filteredBooks.length);

    for (let i = displayCount; i < end; i++) {
        const book = filteredBooks[i];
        const isSelected = selectedBooks.has(book.path);

        const card = createCard(
            book,
            async (path) => await window.__TAURI__.opener.openPath(path),
            (x, y, b) => showCardContextMenu(x, y, b, onGridUpdate, viewMode, selectedBooks),
            isSelected,
            onToggleSelect
        );

        gridState.cardMap[book.path] = card;
        container.appendChild(card);
    }

    gridState.displayCount = end;

    const oldSentinel = container.querySelector(".grid-sentinel");
    if (oldSentinel) oldSentinel.remove();

    if (end < filteredBooks.length) {
        const sentinel = document.createElement("div");
        sentinel.className = "grid-sentinel";
        sentinel.style.height = "50px";
        container.appendChild(sentinel);

        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                renderNextBatch(onGridUpdate, selectedBooks, onToggleSelect);
            }
        }, { rootMargin: "200px" });

        observer.observe(sentinel);
    }
}

export function updateCardSelectionVisual(path, isSelected) {
    const card = gridState.cardMap[path];
    if (card && typeof card.setSelected === "function") {
        card.setSelected(isSelected);
    }
}

// Trả về danh sách paths trong range [fromIndex, toIndex]
// Dùng cho shift+click select nhiều card cùng lúc
export function getShiftSelectRange(fromIndex, toIndex) {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    return gridState.filteredBooks
        .slice(start, end + 1)
        .map(b => b.path);
}

// Lấy index của 1 book trong filteredBooks
export function getBookIndex(path) {
    return gridState.filteredBooks.findIndex(b => b.path === path);
}

// Lưu index card vừa click (để dùng cho shift+click tiếp theo)
export function setLastClickedIndex(index) {
    gridState.lastClickedIndex = index;
}

export function getLastClickedIndex() {
    return gridState.lastClickedIndex;
}

// Trả về paths của tất cả sách trong filteredBooks hiện tại
// Dùng cho selectAllVisible trong main.js — đảm bảo respect folder/search/tag filter
export function getFilteredPaths() {
    return gridState.filteredBooks.map(b => b.path);
}

function applyFilters(books, filterPath, search, sort, selectedTags) {
    let result = books;

    // 1. Filter theo folder
    if (filterPath && filterPath !== "All Documents") {
        result = result.filter(b => {
            const normalizedBook = b.path.replace(/\\/g, "/");
            const normalizedFolder = filterPath.replace(/\\/g, "/").replace(/\/+$/, "");
            return normalizedBook.startsWith(normalizedFolder + "/");
        });
    }

    // 2. Filter theo search
    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        result = result.filter(b => b.file_name.toLowerCase().includes(q));
    }

    // 3. Filter theo tags (AND logic)
    if (selectedTags && selectedTags.length > 0) {
        result = result.filter(b => {
            if (!b.tags || b.tags.length === 0) return false;
            return selectedTags.every(st =>
                b.tags.map(t => t.toLowerCase()).includes(st.toLowerCase())
            );
        });
    }

    // 4. Sort — starred LUÔN lên đầu bất chấp sort kiểu gì
    if (sort === "name-desc") {
        result = [...result].sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return b.file_name.toLowerCase().localeCompare(a.file_name.toLowerCase());
        });
    } else if (sort === "date-desc") {
        result = [...result].sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return (b.date_added || 0) - (a.date_added || 0);
        });
    } else if (sort === "date-asc") {
        result = [...result].sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return (a.date_added || 0) - (b.date_added || 0);
        });
    } else {
        // name-asc (mặc định)
        result = [...result].sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return a.file_name.toLowerCase().localeCompare(b.file_name.toLowerCase());
        });
    }

    return result;
}