#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod scanner;
mod ai_service;

#[tauri::command]
fn add_library_folder(
    app_handle: tauri::AppHandle,
    new_path: String,
) -> Result<Vec<String>, String> {
    db::add_library_folder(app_handle, new_path)
}

#[tauri::command]
fn get_library_folders(app_handle: tauri::AppHandle) -> Vec<String> {
    db::get_folders_list(&app_handle)
}

#[tauri::command]
fn remove_library_folder(
    app_handle: tauri::AppHandle,
    folder_path: String,
) -> Result<Vec<String>, String> {
    db::remove_library_folder(app_handle, folder_path)
}

#[tauri::command]
fn get_library_books(app_handle: tauri::AppHandle) -> Result<Vec<db::BookEntry>, String> {
    db::get_library_books(app_handle)
}

#[tauri::command]
fn get_thumbnail_bytes(
    app_handle: tauri::AppHandle,
    book_path: String,
) -> Result<Vec<u8>, String> {
    db::get_thumbnail_bytes(app_handle, book_path)
}

#[tauri::command]
fn update_book_info(
    app_handle: tauri::AppHandle,
    book_path: String,
    new_name: String,
    new_tags: Vec<String>,
) -> Result<String, String> {
    db::update_book_info(app_handle, book_path, new_name, new_tags)
}

#[tauri::command]
fn export_database(app_handle: tauri::AppHandle, save_path: String) -> Result<String, String> {
    db::export_database(app_handle, save_path)
}

#[tauri::command]
fn import_database(app_handle: tauri::AppHandle, source_path: String) -> Result<String, String> {
    db::import_database(app_handle, source_path)
}

#[tauri::command]
fn update_database(app_handle: tauri::AppHandle) -> Result<String, String> {
    scanner::perform_update_database(app_handle)
}

#[tauri::command]
fn get_all_tags(app_handle: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    db::get_all_tags(app_handle)
}

// ===== THÙNG RÁC =====
// Hai command này cho phép frontend ẩn/khôi phục sách
// Không xóa file thật, chỉ đánh dấu hidden trong database

// Ẩn sách → đưa vào thùng rác (hidden = true)
#[tauri::command]
fn hide_book(app_handle: tauri::AppHandle, book_path: String) -> Result<String, String> {
    db::hide_book(app_handle, book_path)
}

// Khôi phục sách từ thùng rác về thư viện (hidden = false)
#[tauri::command]
fn restore_book(app_handle: tauri::AppHandle, book_path: String) -> Result<String, String> {
    db::restore_book(app_handle, book_path)
}

// ===== FAVORITE / STAR =====
// Toggle starred của 1 sách, trả về trạng thái mới (true/false)
#[tauri::command]
fn toggle_star(app_handle: tauri::AppHandle, book_path: String) -> Result<bool, String> {
    db::toggle_star(app_handle, book_path)
}

// ===== OPEN LOCATION =====
// Mở File Explorer và highlight sẵn file đó
// Windows: explorer /select,"path\to\file.pdf"
// macOS:   open -R "path/to/file.pdf"
#[tauri::command]
fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ===== TAG MANAGEMENT =====

// Đổi tên tag trên toàn bộ sách có tag đó
#[tauri::command]
fn rename_tag(
    app_handle: tauri::AppHandle,
    old_name: String,
    new_name: String,
) -> Result<String, String> {
    db::rename_tag(app_handle, old_name, new_name)
}

// Xóa tag khỏi toàn bộ sách có tag đó
#[tauri::command]
fn delete_tag(
    app_handle: tauri::AppHandle,
    tag_name: String,
) -> Result<String, String> {
    db::delete_tag(app_handle, tag_name)
}

// ===== AI AUTO-TAG =====

// Lấy AI settings hiện tại
#[tauri::command]
fn get_ai_settings(app_handle: tauri::AppHandle) -> Result<ai_service::AiSettings, String> {
    ai_service::get_ai_settings(app_handle)
}

// Lưu AI settings
#[tauri::command]
fn save_ai_settings(
    app_handle: tauri::AppHandle,
    settings: ai_service::AiSettings,
) -> Result<String, String> {
    ai_service::save_ai_settings(app_handle, settings)
}

// Suggest tags cho 1 batch sách — async vì gọi HTTP
// Trả về Vec<AiTagSuggestion> để frontend hiện preview
#[tauri::command]
async fn suggest_tags_batch(
    app_handle: tauri::AppHandle,
    books: Vec<ai_service::BookToTag>,
) -> Result<Vec<ai_service::AiTagSuggestion>, String> {
    ai_service::suggest_tags_batch(app_handle, books).await
}

// Kiểm tra Ollama có đang chạy không
#[tauri::command]
async fn check_ollama(host: String) -> bool {
    ai_service::check_ollama(&host).await
}

// ===== DUPLICATE DETECTION =====
// Tính SHA1 nội dung file để tìm duplicate — chạy on-demand, không lưu vào DB
// Emit progress event "duplicate_progress" để frontend hiện progress bar
#[tauri::command]
fn find_duplicates(app_handle: tauri::AppHandle) -> Result<Vec<db::DuplicateGroup>, String> {
    db::find_duplicates(app_handle)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            add_library_folder,
            get_library_folders,
            remove_library_folder,
            get_library_books,
            get_thumbnail_bytes,
            update_book_info,
            export_database,
            import_database,
            update_database,
            get_all_tags,
            hide_book,
            restore_book,
            reveal_in_explorer,
            toggle_star,
            get_ai_settings,
            save_ai_settings,
            suggest_tags_batch,
            check_ollama,
            rename_tag,
            delete_tag,
            find_duplicates
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}