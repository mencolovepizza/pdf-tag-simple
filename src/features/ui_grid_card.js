import { api } from "./api.js";

// =============================================
// createCard — tạo 1 card sách trong grid
//
// Params:
//   book           — BookEntry object
//   onOpen         — callback khi double click (mở PDF)
//   onContextMenu  — callback khi right click (context menu)
//   isSelected     — bool, card đang được chọn không
//   onToggleSelect — callback khi single click (toggle select)
// =============================================
export function createCard(book, onOpen, onContextMenu, isSelected = false, onToggleSelect = null) {
    const card = document.createElement("div");

    // Hàm apply style theo trạng thái selected/unselected
    function applyCardStyle(selected) {
        card.style.cssText = `
            border: none;
            padding: 10px;
            width: 130px;
            text-align: center;
            border-radius: 10px;
            cursor: pointer;
            background: var(--panel);
            color: var(--text);
            box-shadow: ${selected
                ? "0 0 0 2px var(--primary), 0 4px 12px rgba(0,0,0,0.1)"
                : "0 2px 8px rgba(0,0,0,0.07)"};
            transition: box-shadow 0.15s, transform 0.15s;
            user-select: none;
            display: flex;
            flex-direction: column;
            position: relative;
        `;
    }

    applyCardStyle(isSelected);

    // --- Checkbox indicator (góc trên trái, chỉ hiện khi selected) ---
    const checkmark = document.createElement("div");
    checkmark.style.cssText = `
        position: absolute;
        top: 6px;
        left: 6px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--primary);
        color: white;
        font-size: 11px;
        display: ${isSelected ? "flex" : "none"};
        align-items: center;
        justify-content: center;
        z-index: 1;
        font-weight: bold;
    `;
    checkmark.innerText = "✓";
    card.appendChild(checkmark);

    // --- Star button (góc trên phải) ---
    // Click star → toggle starred, cập nhật visual ngay, lưu vào database
    // Không re-render grid — chỉ update icon + book.starred local
    let starred = book.starred || false;

    const starBtn = document.createElement("div");
    starBtn.style.cssText = `
        position: absolute;
        top: 4px;
        right: 6px;
        font-size: 14px;
        cursor: pointer;
        z-index: 1;
        opacity: ${starred ? "1" : "0.25"};
        transition: opacity 0.15s, transform 0.15s;
        line-height: 1;
    `;
    starBtn.innerText = "⭐";
    starBtn.title = starred ? "Unstar" : "Star";
    card.appendChild(starBtn);

    starBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
            const newState = await api.toggleStar(book.path);
            starred = newState;
            book.starred = newState; // Update local object — sort sẽ dùng giá trị này
            starBtn.style.opacity = newState ? "1" : "0.25";
            starBtn.title = newState ? "Unstar" : "Star";
            starBtn.style.transform = "scale(1.4)";
            setTimeout(() => starBtn.style.transform = "scale(1)", 150);
            // Notify main.js re-sort grid mà không reload thumbnail
            if (window.__APP_ACTIONS__?.onStarToggled) {
                window.__APP_ACTIONS__.onStarToggled(book.path, newState);
            }
        } catch (err) {
            console.error("Toggle star fail:", err);
        }
    });

    // --- Thumbnail area ---
    const thumbArea = document.createElement("div");
    thumbArea.style.cssText = `
        background: var(--hover);
        height: 140px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        margin-bottom: 8px;
        overflow: hidden;
        flex-shrink: 0;
        color: var(--text-secondary);
        font-size: 28px;
    `;
    thumbArea.innerHTML = "📕";

    // --- Title ---
    const title = document.createElement("p");
    title.style.cssText = `
        font-size: 12px;
        margin: 5px 0 6px;
        line-height: 1.25;
        height: 30px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        text-align: center;
        font-weight: 500;
        color: var(--text);
    `;
    title.innerText = book.file_name;

    // --- Tags ---
    const tagsWrap = document.createElement("div");
    tagsWrap.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        justify-content: center;
        align-content: flex-start;
        min-height: 36px;
        max-height: 36px;
        overflow: hidden;
    `;

    const allTags = Array.isArray(book.tags) ? book.tags : [];
    const visibleTags = allTags.slice(0, 5);

    visibleTags.forEach(tag => {
        const chip = document.createElement("span");
        chip.innerText = tag;
        chip.title = tag;
        chip.style.cssText = `
            font-size: 10px;
            line-height: 1.1;
            padding: 2px 6px;
            border-radius: 10px;
            background: var(--primary-soft);
            color: var(--primary);
            max-width: 52px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        tagsWrap.appendChild(chip);
    });

    if (allTags.length > visibleTags.length) {
        const more = document.createElement("span");
        more.innerText = `+${allTags.length - visibleTags.length}`;
        more.style.cssText = `
            font-size: 10px;
            line-height: 1.1;
            padding: 2px 6px;
            border-radius: 10px;
            background: var(--hover);
            color: var(--text-secondary);
        `;
        tagsWrap.appendChild(more);
    }

    card.appendChild(thumbArea);
    card.appendChild(title);
    card.appendChild(tagsWrap);

    // --- Lazy load thumbnail ---
    let loaded = false;
    let objectUrl = null;

    const loadThumbnail = async () => {
        if (loaded) return;
        loaded = true;
        try {
            const bytes = await api.getThumbnail(book.path);
            if (bytes && bytes.length > 0) {
                const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
                objectUrl = URL.createObjectURL(blob);
                const img = document.createElement("img");
                img.src = objectUrl;
                img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                img.loading = "lazy";
                thumbArea.innerHTML = "";
                thumbArea.appendChild(img);
            }
        } catch (err) {
            console.error("Load thumbnail fail:", book.file_name, err);
        }
    };

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadThumbnail();
                    observer.disconnect();
                }
            });
        }, { root: null, rootMargin: "300px", threshold: 0.01 });
        observer.observe(card);
    } else {
        loadThumbnail();
    }

    // --- Events ---
    // FIX: dùng setTimeout trong click để dblclick có thể cancel kịp.
    // Trước đây click fire ngay → toggle select, rồi dblclick fire → mở PDF.
    // Kết quả: mở PDF nhưng card cũng bị select/deselect mỗi lần double click.
    // 200ms đủ để browser phân biệt single vs double click trên mọi OS.
    let clickTimer = null;

    card.addEventListener("click", (e) => {
        if (e.defaultPrevented) return;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            if (typeof onToggleSelect === "function") {
                onToggleSelect(book.path, e.shiftKey);
            }
        }, 200);
    });

    card.addEventListener("dblclick", (e) => {
        clearTimeout(clickTimer);
        onOpen(book.path);
    });

    card.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY, book);
    });

    card.addEventListener("remove", () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    });

    // Expose update visual từ bên ngoài
    card.setSelected = (selected) => {
        applyCardStyle(selected);
        checkmark.style.display = selected ? "flex" : "none";
    };

    return card;
}