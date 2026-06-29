const { invoke } = window.__TAURI__.core;

export const api = {
    getFolders: () => invoke("get_library_folders"),
    getBooks: () => invoke("get_library_books"),
    getThumbnail: (path) => invoke("get_thumbnail_bytes", { bookPath: path }),
    getTags: () => invoke("get_all_tags"),

    addFolder: (path) => invoke("add_library_folder", { newPath: path }),
    removeFolder: (path) => invoke("remove_library_folder", { folderPath: path }),
    updateDatabase: () => invoke("update_database"),

    updateBook: (path, name, tags) =>
        invoke("update_book_info", { bookPath: path, newName: name, newTags: tags }),

    exportDB: (path) => invoke("export_database", { savePath: path }),
    importDB: (path) => invoke("import_database", { sourcePath: path }),

    // Thùng rác — không xóa file thật, chỉ đánh dấu hidden trong database
    hideBook: (path) => invoke("hide_book", { bookPath: path }),
    restoreBook: (path) => invoke("restore_book", { bookPath: path }),

    // Mở File Explorer và highlight sẵn file (Windows: explorer /select, macOS: open -R)
    revealInExplorer: (path) => invoke("reveal_in_explorer", { filePath: path }),

    // Favorite — toggle starred, trả về true/false (trạng thái mới)
    toggleStar: (path) => invoke("toggle_star", { bookPath: path }),

    // ===== AI AUTO-TAG =====
    // Lấy / lưu AI settings (provider, api key, model, vocabulary...)
    getAiSettings: () => invoke("get_ai_settings"),
    saveAiSettings: (settings) => invoke("save_ai_settings", { settings }),

    // Suggest tags cho 1 batch sách — trả về [{path, file_name, suggested_tags, error}]
    // Frontend dùng để hiện preview trước khi apply
    suggestTagsBatch: (books) => invoke("suggest_tags_batch", { books }),

    // Kiểm tra Ollama có đang chạy ở host không
    checkOllama: (host) => invoke("check_ollama", { host }),

    // ===== TAG MANAGEMENT =====
    // Đổi tên tag trên toàn bộ sách có tag đó
    renameTag: (oldName, newName) => invoke("rename_tag", { oldName, newName }),
    // Xóa tag khỏi toàn bộ sách có tag đó
    deleteTag: (tagName) => invoke("delete_tag", { tagName }),

    // ===== DUPLICATE DETECTION =====
    // Tính SHA1 nội dung file để tìm duplicate — chạy on-demand
    // Trả về [{file_hash, books: [...]}] — chỉ nhóm có > 1 file
    findDuplicates: () => invoke("find_duplicates"),
};