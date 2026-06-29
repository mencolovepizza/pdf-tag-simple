import { api } from "./api.js";

// =============================================
// f_duplicates.js — Find & Remove Duplicates
//
// Flow:
//   1. User bấm "Find Duplicates"
//   2. openDuplicates() — hiện modal với progress bar
//   3. Backend tính SHA1 toàn bộ file, emit "duplicate_progress"
//   4. Hiện danh sách nhóm duplicate
//   5. Mỗi nhóm: user chọn file nào GIỮ lại, còn lại vào trash
//   6. Bấm "Move to trash" → gọi api.hideBook cho từng file bị loại
// =============================================
export async function openDuplicates(onApplied) {
    document.querySelectorAll(".duplicates-overlay").forEach(el => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "duplicates-overlay";
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:3000; padding:20px;";

    const modal = document.createElement("div");
    modal.style.cssText = "width:min(720px,100%); background:white; border-radius:14px; box-shadow:0 20px 50px rgba(0,0,0,0.25); overflow:hidden; font-family:inherit; max-height:90vh; display:flex; flex-direction:column;";

    // --- Header ---
    const header = document.createElement("div");
    header.style.cssText = "padding:16px 18px 12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;";
    const headerText = document.createElement("div");
    headerText.innerHTML = `<div style="font-size:18px;font-weight:700;color:#222;">Find Duplicates</div>
        <div style="font-size:12px;color:#777;margin-top:2px;">Compares file content (SHA1). Duplicates will be moved to trash, not deleted.</div>`;
    const closeBtn = document.createElement("button");
    closeBtn.innerText = "x";
    closeBtn.style.cssText = "border:none; background:#f3f4f6; width:34px; height:34px; border-radius:999px; cursor:pointer; font-size:14px;";
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(headerText);
    header.appendChild(closeBtn);

    // --- Body ---
    const body = document.createElement("div");
    body.style.cssText = "padding:18px; display:flex; flex-direction:column; gap:12px; overflow-y:auto; flex:1;";

    const statusText = document.createElement("div");
    statusText.style.cssText = "font-size:13px; color:#555;";
    statusText.innerText = "Click Scan to find duplicate files.";

    const progressWrap = document.createElement("div");
    progressWrap.style.cssText = "background:#e0e0e0; border-radius:3px; height:6px; overflow:hidden; display:none;";
    const progressFill = document.createElement("div");
    progressFill.style.cssText = "height:100%; width:0%; background:#1565c0; transition:width 0.2s;";
    progressWrap.appendChild(progressFill);

    const resultsWrap = document.createElement("div");
    resultsWrap.style.cssText = "display:flex; flex-direction:column; gap:16px;";

    body.appendChild(statusText);
    body.appendChild(progressWrap);
    body.appendChild(resultsWrap);

    // --- Footer ---
    const footer = document.createElement("div");
    footer.style.cssText = "padding:14px 18px; border-top:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:10px; background:#fafafa; flex-shrink:0;";
    const footerLeft = document.createElement("div");
    footerLeft.style.cssText = "font-size:12px; color:#888;";
    const footerRight = document.createElement("div");
    footerRight.style.cssText = "display:flex; gap:8px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Close";
    cancelBtn.style.cssText = "border:1px solid #d1d5db; background:white; color:#333; border-radius:8px; padding:9px 14px; cursor:pointer;";
    cancelBtn.onclick = () => overlay.remove();

    const scanBtn = document.createElement("button");
    scanBtn.innerText = "Scan for duplicates";
    scanBtn.style.cssText = "border:1px solid #1565c0; background:#1565c0; color:white; border-radius:8px; padding:9px 16px; cursor:pointer; font-weight:600;";

    const trashBtn = document.createElement("button");
    trashBtn.innerText = "Move selected to trash";
    trashBtn.style.cssText = "border:1px solid #c00; background:#c00; color:white; border-radius:8px; padding:9px 16px; cursor:pointer; font-weight:600; display:none;";

    footerRight.appendChild(cancelBtn);
    footerRight.appendChild(scanBtn);
    footerRight.appendChild(trashBtn);
    footer.appendChild(footerLeft);
    footer.appendChild(footerRight);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // --- Listen progress events ---
    const { listen } = window.__TAURI__.event;
    let unlistenFn = null;

    unlistenFn = await listen("duplicate_progress", (event) => {
        const { current, total, done } = event.payload;
        if (total > 0) {
            progressFill.style.width = `${Math.round((current / total) * 100)}%`;
            statusText.innerText = `Scanning... ${current}/${total} files`;
        }
        if (done) {
            progressFill.style.width = "100%";
            setTimeout(() => { progressWrap.style.display = "none"; }, 500);
        }
    });

    // --- Scan ---
    let allGroups = [];
    // Map groupIndex → Set of paths user chọn GIỮ
    let keepMap = {};

    scanBtn.onclick = async () => {
        scanBtn.disabled = true;
        scanBtn.innerText = "Scanning...";
        progressWrap.style.display = "";
        progressFill.style.width = "0%";
        resultsWrap.innerHTML = "";
        keepMap = {};

        try {
            allGroups = await api.findDuplicates();

            if (allGroups.length === 0) {
                statusText.innerText = "No duplicates found!";
                statusText.style.color = "#2e7d32";
                scanBtn.disabled = false;
                scanBtn.innerText = "Scan again";
                return;
            }

            statusText.innerText = `Found ${allGroups.length} group(s) of duplicates.`;
            statusText.style.color = "#c00";

            // Render từng nhóm
            allGroups.forEach((group, groupIdx) => {
                // Mặc định giữ file đầu tiên
                keepMap[groupIdx] = new Set([group.books[0].path]);
                resultsWrap.appendChild(renderGroup(group, groupIdx, keepMap));
            });

            scanBtn.innerText = "Scan again";
            scanBtn.disabled = false;
            trashBtn.style.display = "";
            footerLeft.innerText = "Select which file to KEEP in each group. Others will be moved to trash.";

        } catch (err) {
            statusText.innerText = "Error: " + err;
            statusText.style.color = "#c00";
            scanBtn.disabled = false;
            scanBtn.innerText = "Scan again";
        }
    };

    // --- Move to trash ---
    trashBtn.onclick = async () => {
        trashBtn.disabled = true;
        trashBtn.innerText = "Moving to trash...";

        let trashCount = 0;
        for (let groupIdx = 0; groupIdx < allGroups.length; groupIdx++) {
            const group = allGroups[groupIdx];
            const keepPaths = keepMap[groupIdx] || new Set();

            for (const book of group.books) {
                if (!keepPaths.has(book.path)) {
                    try {
                        await api.hideBook(book.path);
                        trashCount++;
                    } catch (err) {
                        console.error("Hide error:", book.path, err);
                    }
                }
            }
        }

        if (unlistenFn) unlistenFn();
        overlay.remove();
        if (typeof onApplied === "function") onApplied();
    };

    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// =============================================
// RENDER 1 NHÓM DUPLICATE
// =============================================
function renderGroup(group, groupIdx, keepMap) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "border:1px solid #eee; border-radius:10px; overflow:hidden;";

    // Group header
    const groupHeader = document.createElement("div");
    groupHeader.style.cssText = "background:#f5f5f5; padding:8px 12px; font-size:12px; color:#888; border-bottom:1px solid #eee;";
    groupHeader.innerText = `Group ${groupIdx + 1} — ${group.books.length} identical files`;
    wrap.appendChild(groupHeader);

    // Mỗi file trong nhóm
    group.books.forEach((book) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid #f0f0f0; transition:background 0.15s;";

        // Radio button — chọn file KEEP
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `dup-group-${groupIdx}`;
        radio.value = book.path;
        radio.checked = keepMap[groupIdx]?.has(book.path) || false;
        radio.style.cssText = "width:16px; height:16px; cursor:pointer; flex-shrink:0;";
        radio.addEventListener("change", () => {
            keepMap[groupIdx] = new Set([book.path]);
            // Update highlight
            wrap.querySelectorAll(".dup-row").forEach(r => {
                r.style.background = r.dataset.path === book.path ? "#f0fff4" : "";
            });
        });

        // Thumbnail nhỏ
        const thumb = document.createElement("div");
        thumb.style.cssText = "width:36px; height:48px; background:#f0f0f0; border-radius:4px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:18px; color:#ccc;";
        thumb.innerText = "📄";

        // Load thumbnail async
        api.getThumbnail(book.path).then(bytes => {
            if (bytes && bytes.length > 0) {
                const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
                const url = URL.createObjectURL(blob);
                const img = document.createElement("img");
                img.src = url;
                img.style.cssText = "width:100%; height:100%; object-fit:cover;";
                thumb.innerHTML = "";
                thumb.appendChild(img);
            }
        }).catch(() => {});

        // File info
        const info = document.createElement("div");
        info.style.cssText = "flex:1; min-width:0;";

        const name = document.createElement("div");
        name.style.cssText = "font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
        name.innerText = book.file_name;
        name.title = book.file_name;

        const path = document.createElement("div");
        path.style.cssText = "font-size:11px; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;";
        path.innerText = book.path;
        path.title = book.path;

        info.appendChild(name);
        info.appendChild(path);

        // Open location button
        const openBtn = document.createElement("button");
        openBtn.innerText = "📁";
        openBtn.title = "Open location";
        openBtn.style.cssText = "border:none; background:transparent; cursor:pointer; font-size:16px; padding:4px; flex-shrink:0;";
        openBtn.onclick = () => api.revealInExplorer(book.path);

        row.classList.add("dup-row");
        row.dataset.path = book.path;
        if (radio.checked) row.style.background = "#f0fff4";

        row.appendChild(radio);
        row.appendChild(thumb);
        row.appendChild(info);
        row.appendChild(openBtn);
        wrap.appendChild(row);
    });

    return wrap;
}