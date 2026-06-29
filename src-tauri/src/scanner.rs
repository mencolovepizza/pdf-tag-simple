use crate::db::{BookDatabase, BookEntry};
use pdfium_render::prelude::*;
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::fs::create_dir_all;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri::Emitter;
use walkdir::WalkDir;

// =============================================
// SCAN PROGRESS EVENT
// Emit từ backend → frontend sau mỗi thumbnail render
// Frontend lắng nghe qua window.__TAURI__.event.listen("scan_progress", ...)
// =============================================
#[derive(Serialize, Clone)]
struct ScanProgress {
    current: usize,   // Số file đã xử lý
    total: usize,     // Tổng số file cần xử lý
    file_name: String, // Tên file đang xử lý (để hiện trong status)
    done: bool,        // true khi hoàn thành toàn bộ
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn generate_thumb_name(pdf_path: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(pdf_path.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    format!("thumb_{}.jpg", hash)
}

fn init_pdfium(app_handle: &tauri::AppHandle) -> Result<Pdfium, String> {
    if let Ok(b) = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./")) {
        return Ok(Pdfium::new(b));
    }

    if let Ok(res_dir) = app_handle.path().resource_dir() {
        if let Ok(b) = Pdfium::bind_to_library(
            Pdfium::pdfium_platform_library_name_at_path(res_dir.to_string_lossy().as_ref()),
        ) {
            return Ok(Pdfium::new(b));
        }
    }

    if let Ok(b) = Pdfium::bind_to_system_library() {
        return Ok(Pdfium::new(b));
    }

    Err("pdfium.dll not found".to_string())
}

pub fn perform_update_database(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_dir.join("cache");
    if !cache_dir.exists() {
        create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    let folders = crate::db::get_folders_list(&app_handle);
    let now_ts = current_timestamp();
    let book_db_path = app_dir.join("library_books.json");

    // Load database cũ để giữ tags, hidden, date_added
    let existing_books: Vec<BookEntry> = if book_db_path.exists() {
        let s = std::fs::read_to_string(&book_db_path).unwrap_or_default();
        serde_json::from_str::<BookDatabase>(&s)
            .unwrap_or(BookDatabase { books: Vec::new() })
            .books
    } else {
        Vec::new()
    };

    let existing_map: HashMap<String, BookEntry> = existing_books
        .into_iter()
        .map(|b| (b.path.clone(), b))
        .collect();

    // Quét tất cả PDF trong các folder đã thêm
    let mut physical_paths = Vec::new();
    let mut seen_paths = HashSet::new();

    for folder in &folders {
        for entry in WalkDir::new(folder).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext.to_string_lossy().eq_ignore_ascii_case("pdf")) {
                let path_str = path.to_string_lossy().to_string();
                if seen_paths.insert(path_str.clone()) {
                    physical_paths.push(path.to_path_buf());
                }
            }
        }
    }

    // Xóa thumbnail của file không còn tồn tại
    let physical_set: HashSet<String> = physical_paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    for old in existing_map.values() {
        if !physical_set.contains(&old.path) && !old.thumbnail_path.is_empty() {
            let _ = std::fs::remove_file(&old.thumbnail_path);
        }
    }

    // Build danh sách sách mới, giữ nguyên metadata cũ
    let mut final_books: Vec<BookEntry> = Vec::new();

    for pdf_path in &physical_paths {
        let pdf_str = pdf_path.to_string_lossy().to_string();
        let file_name = pdf_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let old = existing_map.get(&pdf_str);
        let tags = old.map(|b| b.tags.clone()).unwrap_or_default();
        let date_added = old
            .map(|b| if b.date_added == 0 { now_ts } else { b.date_added })
            .unwrap_or(now_ts);
        // Giữ nguyên trạng thái hidden — không reset khi Update Database
        let hidden = old.map(|b| b.hidden).unwrap_or(false);
        // Giữ nguyên trạng thái starred — không reset khi Update Database
        let starred = old.map(|b| b.starred).unwrap_or(false);

        let thumb_path = cache_dir.join(generate_thumb_name(&pdf_str));
        let thumb_str = thumb_path.to_string_lossy().to_string();

        final_books.push(BookEntry {
            path: pdf_str,
            file_name,
            thumbnail_path: thumb_str,
            tags,
            date_added,
            hidden,
            starred,
        });
    }

    final_books.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));

    // Lưu database
    let json = serde_json::to_string_pretty(&BookDatabase {
        books: final_books.clone(),
    })
    .map_err(|e| e.to_string())?;
    std::fs::write(&book_db_path, json).map_err(|e| e.to_string())?;

    // =============================================
    // RENDER THUMBNAIL + EMIT PROGRESS
    // Emit event "scan_progress" sau mỗi file
    // Frontend lắng nghe để update progress bar
    // =============================================
    let mut render_new = 0;
    let mut render_reused = 0;
    let mut render_fail = 0;

    // Đếm số file cần render mới (chưa có thumbnail)
    let to_render: Vec<_> = physical_paths
        .iter()
        .filter(|p| {
            let thumb = cache_dir.join(generate_thumb_name(&p.to_string_lossy()));
            !thumb.exists()
        })
        .collect();

    let total_new = to_render.len();

    // Emit event bắt đầu (để frontend hiện progress bar)
    let _ = app_handle.emit("scan_progress", ScanProgress {
        current: 0,
        total: total_new,
        file_name: "Scanning...".to_string(),
        done: false,
    });

    if let Ok(pdfium) = init_pdfium(&app_handle) {
        let mut current = 0;

        for pdf_path in &physical_paths {
            let pdf_str = pdf_path.to_string_lossy().to_string();
            let thumb_path = cache_dir.join(generate_thumb_name(&pdf_str));

            if thumb_path.exists() {
                render_reused += 1;
                continue;
            }

            let file_name = pdf_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            current += 1;

            // Emit progress sau mỗi file bắt đầu render
            let _ = app_handle.emit("scan_progress", ScanProgress {
                current,
                total: total_new,
                file_name: file_name.clone(),
                done: false,
            });

            let result: Result<(), String> = (|| {
                let doc = pdfium
                    .load_pdf_from_file(pdf_path, None)
                    .map_err(|e| e.to_string())?;
                let page = doc.pages().get(0).map_err(|e| e.to_string())?;
                let bitmap = page
                    .render_with_config(&PdfRenderConfig::new().set_target_width(150))
                    .map_err(|e| e.to_string())?;
                bitmap
                    .as_image()
                    .save(&thumb_path)
                    .map_err(|e| e.to_string())?;
                Ok(())
            })();

            match result {
                Ok(_) => render_new += 1,
                Err(e) => {
                    render_fail += 1;
                    eprintln!("[thumb FAIL] {} -> {}", pdf_path.display(), e);
                }
            }
        }
    }

    // Emit event hoàn thành
    let _ = app_handle.emit("scan_progress", ScanProgress {
        current: total_new,
        total: total_new,
        file_name: "Done".to_string(),
        done: true,
    });

    Ok(format!(
        "Scanned {} books. New: {}, reused: {}, failed: {}.",
        final_books.len(),
        render_new,
        render_reused,
        render_fail
    ))
}