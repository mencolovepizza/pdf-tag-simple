import { api } from "./api.js";

// =============================================
// f_ai.js — AI Auto-Tag feature
//
// Export:
//   openAiSettings()               — mở modal settings
//   openAiAutoTag(books, selectedBooks, currentFilterPath, allFolders, onApplied)
//                                  — mở modal auto-tag với scope selection
// =============================================

// Cost estimate cho OpenAI gpt-4o-mini
// filename only: ~50 tokens/book
// thumbnail: ~500 tokens/book (image low detail ~85 tokens + text)
const TOKENS_PER_BOOK_TEXT = 50;
const TOKENS_PER_BOOK_IMAGE = 500;
const COST_PER_1K_INPUT = 0.00015; // gpt-4o-mini input price

function estimateCost(bookCount, inputMode) {
    const tokensPerBook = inputMode === "thumbnail" ? TOKENS_PER_BOOK_IMAGE : TOKENS_PER_BOOK_TEXT;
    const totalTokens = bookCount * tokensPerBook;
    const cost = (totalTokens / 1000) * COST_PER_1K_INPUT;
    return { totalTokens, cost: cost.toFixed(4) };
}

// =============================================
// AI SETTINGS MODAL
// =============================================
export async function openAiSettings() {
    document.querySelectorAll(".ai-settings-overlay").forEach(el => el.remove());

    let settings = await api.getAiSettings().catch(() => ({
        provider: "openai",
        openai_api_key: "",
        openai_model: "gpt-4o-mini",
        ollama_host: "http://localhost:11434",
        ollama_model: "llama3.2",
        input_mode: "filename",
        tag_vocabulary: [],
        skip_if_tags_gte: 5,
        tag_language: "auto",
    }));

    const overlay = document.createElement("div");
    overlay.className = "ai-settings-overlay";
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:3000; padding:20px;";

    const modal = document.createElement("div");
    modal.style.cssText = "width:min(600px,100%); background:var(--panel); color:var(--text); border-radius:14px; box-shadow:var(--shadow-md); overflow:hidden; font-family:inherit; max-height:90vh; display:flex; flex-direction:column; border:1px solid var(--border);";

    // Header
    const header = document.createElement("div");
    header.style.cssText = "padding:16px 18px 12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;";
    header.innerHTML = `<div style="font-size:18px;font-weight:700;color:var(--text);">AI Settings</div>`;
    const closeBtn = makeCloseBtn(() => overlay.remove());
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement("div");
    body.style.cssText = "padding:18px; display:flex; flex-direction:column; gap:14px; overflow-y:auto;";

    // Provider
    body.appendChild(makeLabel("Provider"));
    const providerSelect = makeSelect([
        { value: "openai", label: "OpenAI (online)" },
        { value: "ollama", label: "Ollama (local)" },
    ], settings.provider);
    body.appendChild(providerSelect);

    // OpenAI section
    const openaiSection = document.createElement("div");
    openaiSection.style.cssText = "display:flex; flex-direction:column; gap:10px;";
    openaiSection.appendChild(makeLabel("OpenAI API Key"));
    const apiKeyInput = makeInput("password", settings.openai_api_key, "sk-...");
    openaiSection.appendChild(apiKeyInput);
    openaiSection.appendChild(makeLabel("OpenAI Model"));
    const openaiModelSelect = makeSelect([
        { value: "gpt-4o-mini", label: "gpt-4o-mini (fast, cheap)" },
        { value: "gpt-4o", label: "gpt-4o (more accurate)" },
    ], settings.openai_model);
    openaiSection.appendChild(openaiModelSelect);

    // Ollama section
    const ollamaSection = document.createElement("div");
    ollamaSection.style.cssText = "display:flex; flex-direction:column; gap:10px;";
    ollamaSection.appendChild(makeLabel("Ollama Host"));
    const ollamaHostInput = makeInput("text", settings.ollama_host, "http://localhost:11434");
    ollamaSection.appendChild(ollamaHostInput);

    const ollamaStatusRow = document.createElement("div");
    ollamaStatusRow.style.cssText = "display:flex; gap:8px; align-items:center;";
    const ollamaStatus = document.createElement("span");
    ollamaStatus.style.cssText = "font-size:12px; color:var(--text-secondary);";
    ollamaStatus.innerText = "Not checked";
    const checkBtn = document.createElement("button");
    checkBtn.innerText = "Check connection";
    checkBtn.style.cssText = "padding:6px 12px; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:12px; background:var(--panel); color:var(--text);";
    checkBtn.onclick = async () => {
        ollamaStatus.innerText = "Checking...";
        const ok = await api.checkOllama(ollamaHostInput.value);
        ollamaStatus.innerText = ok ? "Connected" : "Not reachable";
        ollamaStatus.style.color = ok ? "#2e7d32" : "#c00";
    };
    ollamaStatusRow.appendChild(checkBtn);
    ollamaStatusRow.appendChild(ollamaStatus);
    ollamaSection.appendChild(ollamaStatusRow);
    ollamaSection.appendChild(makeLabel("Ollama Model"));
    const ollamaModelInput = makeInput("text", settings.ollama_model, "llama3.2");
    ollamaSection.appendChild(ollamaModelInput);
    const ollamaHint = document.createElement("div");
    ollamaHint.style.cssText = "font-size:11px; color:var(--text-secondary);";
    ollamaHint.innerText = "For thumbnail mode, use a vision model: llava, llama3.2-vision";
    ollamaSection.appendChild(ollamaHint);

    body.appendChild(openaiSection);
    body.appendChild(ollamaSection);

    function updateProviderSections() {
        openaiSection.style.display = providerSelect.value === "openai" ? "flex" : "none";
        ollamaSection.style.display = providerSelect.value === "ollama" ? "flex" : "none";
    }
    providerSelect.addEventListener("change", updateProviderSections);
    updateProviderSections();

    // Input mode
    body.appendChild(makeDivider());
    body.appendChild(makeLabel("Input Mode"));
    const inputModeSelect = makeSelect([
        { value: "filename", label: "Filename only (fast, works with any model)" },
        { value: "thumbnail", label: "Filename + cover image (needs vision model)" },
    ], settings.input_mode);
    body.appendChild(inputModeSelect);

    // Tag language
    body.appendChild(makeDivider());
    body.appendChild(makeLabel("Tag Language"));
    const langSelect = makeSelect([
        { value: "auto", label: "Auto (follow filename language)" },
        { value: "en",   label: "English" },
        { value: "vi",   label: "Vietnamese (Tiếng Việt)" },
        { value: "zh",   label: "Chinese (中文)" },
        { value: "ja",   label: "Japanese (日本語)" },
        { value: "ko",   label: "Korean (한국어)" },
        { value: "es",   label: "Spanish (Español)" },
        { value: "fr",   label: "French (Français)" },
        { value: "de",   label: "German (Deutsch)" },
        { value: "id",   label: "Indonesian (Bahasa)" },
    ], settings.tag_language || "auto");
    body.appendChild(langSelect);

    // Skip threshold
    body.appendChild(makeDivider());
    body.appendChild(makeLabel("Skip books with tags ≥"));
    const skipInput = makeInput("number", String(settings.skip_if_tags_gte), "5");
    skipInput.style.width = "80px";
    body.appendChild(skipInput);
    const skipHint = document.createElement("div");
    skipHint.style.cssText = "font-size:11px; color:var(--text-secondary);";
    skipHint.innerText = "Books already having this many tags will be skipped.";
    body.appendChild(skipHint);

    // Tag vocabulary
    body.appendChild(makeDivider());
    body.appendChild(makeLabel("Tag Vocabulary (optional)"));
    const vocabHint = document.createElement("div");
    vocabHint.style.cssText = "font-size:11px; color:var(--text-secondary); margin-bottom:6px;";
    vocabHint.innerText = "Preferred tags. AI will map to these when they fit (e.g. 'sci-fi' instead of 'science fiction'). Leave empty for free tagging.";
    body.appendChild(vocabHint);

    let vocabTags = [...(settings.tag_vocabulary || [])];
    const vocabEditor = document.createElement("div");
    vocabEditor.style.cssText = "border:1px solid var(--border); border-radius:10px; padding:8px; min-height:52px; display:flex; flex-wrap:wrap; align-items:center; gap:8px; background:var(--panel);";
    const vocabInput = makeInput("text", "", "Add tag and press Enter...");
    vocabInput.style.cssText = "border:none; outline:none; flex:1; min-width:150px; font-size:13px; padding:4px 2px; background:transparent;";

    function renderVocabChips() {
        vocabEditor.innerHTML = "";
        vocabTags.forEach((tag, i) => {
            const chip = document.createElement("span");
            chip.style.cssText = "display:inline-flex; align-items:center; gap:4px; background:var(--primary-soft); border:1px solid var(--primary); color:var(--primary); border-radius:999px; padding:4px 8px; font-size:12px;";
            const t = document.createElement("span"); t.innerText = tag;
            const x = document.createElement("button");
            x.innerText = "x"; x.style.cssText = "border:none; background:transparent; color:var(--primary); cursor:pointer; font-size:12px; padding:0;";
            x.onclick = () => { vocabTags.splice(i, 1); renderVocabChips(); };
            chip.appendChild(t); chip.appendChild(x);
            vocabEditor.appendChild(chip);
        });
        vocabEditor.appendChild(vocabInput);
    }
    vocabInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const tag = vocabInput.value.trim();
            if (tag && !vocabTags.includes(tag)) { vocabTags.push(tag); vocabInput.value = ""; renderVocabChips(); }
            else vocabInput.value = "";
        }
    });
    renderVocabChips();
    body.appendChild(vocabEditor);

    // Footer
    const footer = document.createElement("div");
    footer.style.cssText = "padding:14px 18px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px; background:var(--panel-soft); flex-shrink:0;";
    const cancelBtn = makeBtn("Cancel", false, () => overlay.remove());
    const saveBtn = makeBtn("Save Settings", true, async () => {
        const v = vocabInput.value.trim();
        if (v && !vocabTags.includes(v)) vocabTags.push(v);
        const newSettings = {
            provider: providerSelect.value,
            openai_api_key: apiKeyInput.value.trim(),
            openai_model: openaiModelSelect.value,
            ollama_host: ollamaHostInput.value.trim(),
            ollama_model: ollamaModelInput.value.trim(),
            input_mode: inputModeSelect.value,
            tag_language: langSelect.value,
            tag_vocabulary: vocabTags,
            skip_if_tags_gte: parseInt(skipInput.value) || 5,
        };
        try {
            await api.saveAiSettings(newSettings);
            overlay.remove();
        } catch (err) { alert("Error saving settings: " + err); }
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function esc(e) {
        if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", esc); }
    }, { once: true });
}

// =============================================
// AI AUTO-TAG MODAL
//
// Params:
//   allBooks          — state.books filter !hidden
//   selectedBooks     — Set<path> từ main.js
//   currentFilterPath — folder đang chọn
//   onApplied         — callback sau khi apply xong
// =============================================
export async function openAiAutoTag(allBooks, selectedBooks, currentFilterPath, onApplied) {
    document.querySelectorAll(".ai-autotag-overlay").forEach(el => el.remove());

    const settings = await api.getAiSettings().catch(() => null);
    if (!settings) { alert("Could not load AI settings."); return; }
    if (settings.provider === "openai" && !settings.openai_api_key) {
        alert("OpenAI API key is not set. Please configure in AI Settings.");
        return;
    }

    const BATCH_SIZE = 20;

    // Scope options
    const selectedArr = selectedBooks ? [...selectedBooks] : [];
    const folderBooks = currentFilterPath && currentFilterPath !== "All Documents"
        ? allBooks.filter(b => b.path.replace(/\\/g, "/").startsWith(currentFilterPath.replace(/\\/g, "/").replace(/\/+$/, "") + "/"))
        : [];

    const overlay = document.createElement("div");
    overlay.className = "ai-autotag-overlay";
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:3000; padding:20px;";

    const modal = document.createElement("div");
    modal.style.cssText = "width:min(700px,100%); background:var(--panel); color:var(--text); border-radius:14px; box-shadow:var(--shadow-md); overflow:hidden; font-family:inherit; max-height:90vh; display:flex; flex-direction:column; border:1px solid var(--border);";

    // Header
    const header = document.createElement("div");
    header.style.cssText = "padding:16px 18px 12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;";
    header.innerHTML = `<div style="font-size:18px;font-weight:700;color:var(--text);">AI Auto-Tag</div>`;
    header.appendChild(makeCloseBtn(() => overlay.remove()));

    // Body
    const body = document.createElement("div");
    body.style.cssText = "padding:18px; display:flex; flex-direction:column; gap:14px; overflow-y:auto; flex:1;";

    // --- Scope selection ---
    const scopeBlock = document.createElement("div");
    scopeBlock.style.cssText = "display:flex; flex-direction:column; gap:8px;";
    scopeBlock.appendChild(makeLabel("Tag which books?"));

    const scopeOptions = [
        { value: "all", label: `All books (${allBooks.length})` },
    ];
    if (folderBooks.length > 0) {
        scopeOptions.push({ value: "folder", label: `Current folder (${folderBooks.length})` });
    }
    if (selectedArr.length > 0) {
        scopeOptions.push({ value: "selected", label: `Selected books (${selectedArr.length})` });
    }

    const scopeSelect = makeSelect(scopeOptions, selectedArr.length > 0 ? "selected" : "all");
    scopeBlock.appendChild(scopeSelect);
    body.appendChild(scopeBlock);

    // --- Cost estimate ---
    // Ẩn hoàn toàn khi provider = ollama (local = free, không cần estimate)
    const costBox = document.createElement("div");
    costBox.style.cssText = "background:var(--panel-soft); border:1px solid var(--border); border-radius:8px; padding:10px 14px; font-size:12px; color:var(--text-secondary);";

    function updateCostEstimate() {
        // Ẩn cost box khi dùng Ollama
        if (settings.provider === "ollama") {
            costBox.style.display = "none";
            return;
        }
        costBox.style.display = "";

        const scope = scopeSelect.value;
        let books;
        if (scope === "selected") books = allBooks.filter(b => selectedArr.includes(b.path));
        else if (scope === "folder") books = folderBooks;
        else books = allBooks;

        const eligible = books.filter(b => (b.tags?.length || 0) < settings.skip_if_tags_gte);
        const { totalTokens, cost } = estimateCost(eligible.length, settings.input_mode);

        let costText = `~${eligible.length} books · ~${totalTokens.toLocaleString()} tokens · Est. cost: $${cost}`;
        if (settings.input_mode === "thumbnail") {
            costText += " ⚠️ Thumbnail mode costs more";
        }

        costBox.innerHTML = `<b>Estimate:</b> ${costText}<br>
            <span style="color:var(--text-secondary);">Provider: ${settings.provider} · Input: ${settings.input_mode} · Language: ${settings.tag_language || "auto"} · Skip ≥${settings.skip_if_tags_gte} tags</span>`;
    }

    scopeSelect.addEventListener("change", updateCostEstimate);
    updateCostEstimate();
    body.appendChild(costBox);

    // --- Progress + results ---
    const statusText = document.createElement("div");
    statusText.style.cssText = "font-size:13px; color:var(--text-secondary);";
    statusText.innerText = "Click Start to begin tagging.";

    const progressWrap = document.createElement("div");
    progressWrap.style.cssText = "background:var(--border); border-radius:3px; height:6px; overflow:hidden; display:none;";
    const progressFill = document.createElement("div");
    progressFill.style.cssText = "height:100%; width:0%; background:var(--primary); transition:width 0.3s;";
    progressWrap.appendChild(progressFill);

    const resultsWrap = document.createElement("div");
    resultsWrap.style.cssText = "display:flex; flex-direction:column; gap:8px;";

    body.appendChild(statusText);
    body.appendChild(progressWrap);
    body.appendChild(resultsWrap);

    // Footer
    const footer = document.createElement("div");
    footer.style.cssText = "padding:14px 18px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; gap:10px; background:var(--panel-soft); flex-shrink:0;";
    const footerLeft = document.createElement("div");
    footerLeft.style.cssText = "font-size:12px; color:var(--text-secondary);";
    const footerRight = document.createElement("div");
    footerRight.style.cssText = "display:flex; gap:8px;";

    const cancelBtn = makeBtn("Cancel", false, () => overlay.remove());
    const startBtn = makeBtn("Start tagging", true, null);
    const applyBtn = makeBtn("Apply all", true, null);
    applyBtn.style.display = "none";
    applyBtn.style.background = "var(--success)";
    applyBtn.style.borderColor = "var(--success)";

    footerRight.appendChild(cancelBtn);
    footerRight.appendChild(startBtn);
    footerRight.appendChild(applyBtn);
    footer.appendChild(footerLeft);
    footer.appendChild(footerRight);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let allSuggestions = [];

    // Start
    startBtn.onclick = async () => {
        const scope = scopeSelect.value;
        let booksToProcess;
        if (scope === "selected") booksToProcess = allBooks.filter(b => selectedArr.includes(b.path));
        else if (scope === "folder") booksToProcess = folderBooks;
        else booksToProcess = allBooks;

        const eligible = booksToProcess.filter(b => (b.tags?.length || 0) < settings.skip_if_tags_gte);

        if (eligible.length === 0) {
            statusText.innerText = "No books to tag (all have enough tags already).";
            return;
        }

        startBtn.disabled = true;
        scopeSelect.disabled = true;
        progressWrap.style.display = "";
        resultsWrap.innerHTML = "";
        allSuggestions = [];

        const total = eligible.length;
        let processed = 0;

        for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
            const batch = eligible.slice(i, i + BATCH_SIZE);
            statusText.innerText = `Tagging batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)}... (${processed}/${total})`;

            try {
                const suggestions = await api.suggestTagsBatch(batch.map(b => ({
                    path: b.path,
                    file_name: b.file_name,
                    thumbnail_path: b.thumbnail_path || "",
                    current_tags: b.tags || [],
                })));

                allSuggestions.push(...suggestions);
                for (const s of suggestions) resultsWrap.appendChild(renderSuggestionRow(s));
                processed += batch.length;
                progressFill.style.width = `${Math.round((processed / total) * 100)}%`;
            } catch (err) {
                statusText.innerText = `Error: ${err}`;
                statusText.style.color = "var(--danger)";
                break;
            }
        }

        statusText.innerText = `Done! ${allSuggestions.filter(s => !s.error).length}/${total} books tagged.`;
        progressFill.style.width = "100%";
        startBtn.style.display = "none";
        applyBtn.style.display = "";
        footerLeft.innerText = "Review tags above, then click Apply.";
    };

    // Apply
    applyBtn.onclick = async () => {
        applyBtn.disabled = true;
        applyBtn.innerText = "Applying...";

        const books = await api.getBooks();
        let applied = 0;

        for (const s of allSuggestions) {
            if (s.error || s.suggested_tags.length === 0) continue;

            const row = resultsWrap.querySelector(`[data-path="${CSS.escape(s.path)}"]`);
            let finalTags = s.suggested_tags;
            if (row) {
                const chips = row.querySelectorAll(".tag-chip-text");
                finalTags = [...chips].map(el => el.innerText).filter(Boolean);
            }

            try {
                const book = books.find(b => b.path === s.path);
                const existing = book?.tags || [];
                const merged = [...existing];
                for (const t of finalTags) {
                    if (!merged.some(x => x.toLowerCase() === t.toLowerCase())) merged.push(t);
                }
                await api.updateBook(s.path, book?.file_name || s.file_name, merged);
                applied++;
            } catch (err) {
                console.error("Apply error:", s.path, err);
            }
        }

        overlay.remove();
        if (typeof onApplied === "function") onApplied();
    };

    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// =============================================
// SUGGESTION ROW
// =============================================
function renderSuggestionRow(suggestion) {
    const row = document.createElement("div");
    row.dataset.path = suggestion.path;
    row.style.cssText = "border:1px solid var(--border); border-radius:8px; padding:10px 12px; background:var(--panel-soft); display:flex; flex-direction:column; gap:6px;";

    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-size:12px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    nameEl.innerText = suggestion.file_name;
    nameEl.title = suggestion.file_name;

    if (suggestion.error) {
        const errEl = document.createElement("div");
        errEl.style.cssText = "font-size:11px; color:var(--danger);";
        errEl.innerText = "Error: " + suggestion.error;
        row.appendChild(nameEl);
        row.appendChild(errEl);
        return row;
    }

    const tagsWrap = document.createElement("div");
    tagsWrap.style.cssText = "display:flex; flex-wrap:wrap; gap:6px; align-items:center;";
    let currentTags = [...suggestion.suggested_tags];

    function renderChips() {
        tagsWrap.innerHTML = "";
        currentTags.forEach((tag, i) => {
            const chip = document.createElement("span");
            chip.style.cssText = "display:inline-flex; align-items:center; gap:4px; background:var(--primary-soft); border:1px solid var(--primary); color:var(--primary); border-radius:999px; padding:3px 8px; font-size:11px;";
            const t = document.createElement("span"); t.className = "tag-chip-text"; t.innerText = tag;
            const x = document.createElement("button");
            x.innerText = "x"; x.style.cssText = "border:none; background:transparent; color:var(--primary); cursor:pointer; font-size:11px; padding:0;";
            x.onclick = () => { currentTags.splice(i, 1); renderChips(); };
            chip.appendChild(t); chip.appendChild(x);
            tagsWrap.appendChild(chip);
        });
    }
    renderChips();
    row.appendChild(nameEl);
    row.appendChild(tagsWrap);
    return row;
}

// =============================================
// UI HELPERS
// =============================================
function makeLabel(text) {
    const el = document.createElement("div");
    el.style.cssText = "font-size:13px; font-weight:600; color:var(--text);";
    el.innerText = text;
    return el;
}

function makeInput(type, value, placeholder) {
    const el = document.createElement("input");
    el.type = type; el.value = value; el.placeholder = placeholder;
    el.style.cssText = "width:100%; padding:9px 12px; border:1px solid var(--border); border-radius:8px; font-size:13px; outline:none; box-sizing:border-box; background:var(--panel); color:var(--text);";
    return el;
}

function makeSelect(options, selected) {
    const el = document.createElement("select");
    el.style.cssText = "width:100%; padding:9px 12px; border:1px solid var(--border); border-radius:8px; font-size:13px; outline:none; background:var(--panel); color:var(--text);";
    options.forEach(opt => {
        const o = document.createElement("option");
        o.value = opt.value; o.innerText = opt.label;
        if (opt.value === selected) o.selected = true;
        el.appendChild(o);
    });
    return el;
}

function makeBtn(label, primary, onclick) {
    const el = document.createElement("button");
    el.innerText = label;
    el.style.cssText = primary
        ? "border:1px solid var(--primary); background:var(--primary); color:white; border-radius:8px; padding:9px 16px; cursor:pointer; font-weight:600;"
        : "border:1px solid var(--border); background:var(--panel); color:var(--text); border-radius:8px; padding:9px 14px; cursor:pointer;";
    if (onclick) el.onclick = onclick;
    return el;
}

function makeCloseBtn(onclick) {
    const el = document.createElement("button");
    el.innerText = "x";
    el.style.cssText = "border:none; background:var(--hover); color:var(--text); width:34px; height:34px; border-radius:999px; cursor:pointer; font-size:14px;";
    el.onclick = onclick;
    return el;
}

function makeDivider() {
    const el = document.createElement("hr");
    el.style.cssText = "border:none; border-top:1px solid var(--border); margin:4px 0;";
    return el;
}