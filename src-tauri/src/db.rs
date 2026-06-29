use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

// ===== CÁC STRUCT DỮ LIỆU =====
// Đây là các "khuôn" dữ liệu. Rust dùng để đọc/ghi JSON.
// Serialize = có thể chuyển sang JSON
// Deserialize = có thể đọc từ JSON

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FolderDatabase {
    pub folders: Vec<String>, // Danh sách đường dẫn folder đã thêm
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BookEntry {
    pub path: String,           // Đường dẫn đầy đủ tới file PDF
    pub file_name: String,      // Tên hiển thị (có thể đổi tên)
    pub thumbnail_path: String, // Đường dẫn tới ảnh bìa đã render
    pub tags: Vec<String>,      // Danh sách tags
    #[serde(default)]
    pub date_added: i64,        // Timestamp lúc thêm vào thư viện
    // --- THÊM MỚI ---
    // hidden: true = sách đang trong thùng rác
    // hidden: false = sách bình thường trong thư viện
    // #[serde(default)] nghĩa là: nếu file JSON cũ chưa có field này
    // thì tự động hiểu là false — KHÔNG bị lỗi khi đọc dữ liệu cũ
    #[serde(default)]
    pub hidden: bool,
    // starred: true = sách được đánh dấu yêu thích
    // Sách starred luôn hiện đầu grid bất chấp sort
    #[serde(default)]
    pub starred: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BookDatabase {
    pub books: Vec<BookEntry>, // Toàn bộ sách trong thư viện
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BackupData {
    pub version: u32,          // Phiên bản backup (để sau này nâng cấp định dạng)
    pub exported_at: i64,      // Timestamp lúc export
    pub folders: Vec<String>,  // Danh sách folder
    pub books: Vec<BookEntry>, // Toàn bộ sách (kể cả sách hidden)
}

// ===== HÀM TIỆN ÍCH NỘI BỘ =====

// Trả về timestamp hiện tại (số giây từ 1970)
fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// Trả về đường dẫn thư mục data của app (nơi lưu database.json, library_books.json)
// Tự tạo thư mục nếu chưa có
fn app_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

// ===== FOLDERS =====
// Quản lý danh sách folder đã thêm vào thư viện
// Lưu trong: database.json

// Đọc danh sách folder (dùng nội bộ, không expose ra frontend trực tiếp)
pub fn get_folders_list(app_handle: &tauri::AppHandle) -> Vec<String> {
    let db_path = match app_dir(app_handle) {
        Ok(d) => d.join("database.json"),
        Err(_) => return Vec::new(),
    };

    if !db_path.exists() {
        return Vec::new();
    }

    let mut s = String::new();
    if File::open(&db_path)
        .and_then(|mut f| f.read_to_string(&mut s))
        .is_err()
    {
        return Vec::new();
    }

    serde_json::from_str::<FolderDatabase>(&s)
        .unwrap_or(FolderDatabase { folders: Vec::new() })
        .folders
}

// Thêm folder mới vào danh sách
// Trả về danh sách folder mới nhất sau khi thêm
pub fn add_library_folder(
    app_handle: tauri::AppHandle,
    new_path: String,
) -> Result<Vec<String>, String> {
    let db_path = app_dir(&app_handle)?.join("database.json");

    let mut db: FolderDatabase = if db_path.exists() {
        let mut s = String::new();
        File::open(&db_path)
            .map_err(|e| e.to_string())?
            .read_to_string(&mut s)
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&s).unwrap_or(FolderDatabase { folders: Vec::new() })
    } else {
        FolderDatabase { folders: Vec::new() }
    };

    if !db.folders.contains(&new_path) {
        db.folders.push(new_path);
        db.folders.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        std::fs::write(
            &db_path,
            serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(db.folders)
}

// Xóa folder khỏi danh sách (không xóa file thật, chỉ bỏ theo dõi)
// Trả về danh sách folder còn lại
pub fn remove_library_folder(
    app_handle: tauri::AppHandle,
    folder_path: String,
) -> Result<Vec<String>, String> {
    let db_path = app_dir(&app_handle)?.join("database.json");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let mut db: FolderDatabase =
        serde_json::from_str(&s).unwrap_or(FolderDatabase { folders: Vec::new() });

    db.folders.retain(|f| f != &folder_path);

    std::fs::write(
        &db_path,
        serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(db.folders)
}

// ===== BOOKS =====
// Quản lý toàn bộ sách trong thư viện
// Lưu trong: library_books.json

// Lấy danh sách tất cả tags + số lần dùng
// Chỉ đếm tags của sách KHÔNG hidden (sách trong thùng rác không tính)
pub fn get_all_tags(app_handle: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let db: BookDatabase = serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    let mut map: HashMap<String, i32> = HashMap::new();
    for book in db.books {
        // Bỏ qua sách đang trong thùng rác khi đếm tags
        if book.hidden {
            continue;
        }
        for tag in book.tags {
            *map.entry(tag).or_insert(0) += 1;
        }
    }

    let mut result: Vec<serde_json::Value> = map
        .into_iter()
        .map(|(name, count)| serde_json::json!({ "name": name, "count": count }))
        .collect();

    result.sort_by(|a, b| {
        b["count"]
            .as_i64()
            .unwrap_or(0)
            .cmp(&a["count"].as_i64().unwrap_or(0))
    });

    Ok(result)
}

// Cập nhật tên hiển thị và tags của 1 sách
// Gọi từ modal "Đổi tên & Tags" trong frontend
pub fn update_book_info(
    app_handle: tauri::AppHandle,
    book_path: String,
    new_name: String,
    new_tags: Vec<String>,
) -> Result<String, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Err("Database không tồn tại".to_string());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let mut db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    if let Some(book) = db.books.iter_mut().find(|b| b.path == book_path) {
        book.file_name = new_name;
        book.tags = new_tags;

        std::fs::write(
            &db_path,
            serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        Ok("Cập nhật thành công".to_string())
    } else {
        Err("Không tìm thấy sách".to_string())
    }
}

// Lấy toàn bộ sách (cả hidden lẫn không hidden)
// Frontend sẽ tự lọc tùy theo đang ở library view hay trash view
pub fn get_library_books(app_handle: tauri::AppHandle) -> Result<Vec<BookEntry>, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let s = std::fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    let db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    Ok(db.books)
}

// Lấy bytes ảnh thumbnail của 1 sách theo đường dẫn
// Frontend gọi khi card scroll vào viewport (lazy load)
pub fn get_thumbnail_bytes(
    app_handle: tauri::AppHandle,
    book_path: String,
) -> Result<Vec<u8>, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let s = std::fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    let db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    let Some(book) = db.books.iter().find(|b| b.path == book_path) else {
        return Ok(Vec::new());
    };

    if book.thumbnail_path.is_empty() {
        return Ok(Vec::new());
    }

    let thumb_path = PathBuf::from(&book.thumbnail_path);
    if !thumb_path.exists() {
        return Ok(Vec::new());
    }

    std::fs::read(&thumb_path).map_err(|e| e.to_string())
}

// ===== THÙNG RÁC =====
// Không xóa file thật. Chỉ đánh dấu hidden = true/false trong database.
// User muốn xóa thật thì dùng "Open Location" rồi tự xóa ngoài file explorer.

// Ẩn 1 sách khỏi thư viện → đưa vào thùng rác
// Đặt hidden = true cho sách có đường dẫn book_path
pub fn hide_book(
    app_handle: tauri::AppHandle,
    book_path: String,
) -> Result<String, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Err("Database không tồn tại".to_string());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let mut db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    if let Some(book) = db.books.iter_mut().find(|b| b.path == book_path) {
        book.hidden = true;

        std::fs::write(
            &db_path,
            serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        Ok("Đã ẩn sách".to_string())
    } else {
        Err("Không tìm thấy sách".to_string())
    }
}

// Khôi phục 1 sách từ thùng rác về thư viện
// Đặt hidden = false cho sách có đường dẫn book_path
pub fn restore_book(
    app_handle: tauri::AppHandle,
    book_path: String,
) -> Result<String, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Err("Database không tồn tại".to_string());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let mut db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    if let Some(book) = db.books.iter_mut().find(|b| b.path == book_path) {
        book.hidden = false;

        std::fs::write(
            &db_path,
            serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        Ok("Đã khôi phục sách".to_string())
    } else {
        Err("Không tìm thấy sách".to_string())
    }
}

// ===== FAVORITE / STAR =====
// Toggle trạng thái starred của 1 sách
// starred = true → hiện đầu grid bất chấp sort
// starred = false → về vị trí bình thường theo sort
pub fn toggle_star(
    app_handle: tauri::AppHandle,
    book_path: String,
) -> Result<bool, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Err("Database not found".to_string());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let mut db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    if let Some(book) = db.books.iter_mut().find(|b| b.path == book_path) {
        book.starred = !book.starred; // Toggle
        let new_state = book.starred;

        std::fs::write(
            &db_path,
            serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        Ok(new_state) // Trả về trạng thái mới để frontend cập nhật UI ngay
    } else {
        Err("Book not found".to_string())
    }
}

// ===== TAG MANAGEMENT =====
// Rename hoặc xóa 1 tag khỏi toàn bộ sách trong library

// Đổi tên tag trên tất cả sách có tag đó
// old_name → new_name, giữ nguyên các tags khác
pub fn rename_tag(
    app_handle: tauri::AppHandle,
    old_name: String,
    new_name: String,
) -> Result<String, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Err("Database not found".to_string());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let mut db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    let mut count = 0;
    for book in db.books.iter_mut() {
        for tag in book.tags.iter_mut() {
            if tag.to_lowercase() == old_name.to_lowercase() {
                *tag = new_name.clone();
                count += 1;
            }
        }
    }

    std::fs::write(
        &db_path,
        serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("Renamed '{}' → '{}' in {} books", old_name, new_name, count))
}

// Xóa tag khỏi tất cả sách có tag đó
pub fn delete_tag(
    app_handle: tauri::AppHandle,
    tag_name: String,
) -> Result<String, String> {
    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Err("Database not found".to_string());
    }

    let mut s = String::new();
    File::open(&db_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let mut db: BookDatabase =
        serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    let mut count = 0;
    for book in db.books.iter_mut() {
        let before = book.tags.len();
        book.tags.retain(|t| t.to_lowercase() != tag_name.to_lowercase());
        if book.tags.len() < before { count += 1; }
    }

    std::fs::write(
        &db_path,
        serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("Deleted '{}' from {} books", tag_name, count))
}

// ===== DUPLICATE DETECTION =====
// Tính SHA1 của nội dung file để tìm duplicate
// Không lưu vào database — tính on-demand khi user bấm "Find Duplicates"
// Emit progress event "duplicate_progress" để frontend hiện progress bar

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DuplicateGroup {
    pub file_hash: String,          // SHA1 hash chung của nhóm
    pub books: Vec<BookEntry>,      // Danh sách sách trùng nhau
}

pub fn find_duplicates(
    app_handle: tauri::AppHandle,
) -> Result<Vec<DuplicateGroup>, String> {
    use sha1::{Digest, Sha1};
    use std::collections::HashMap;
    use tauri::Emitter;

    let db_path = app_dir(&app_handle)?.join("library_books.json");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let s = std::fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    let db: BookDatabase = serde_json::from_str(&s).unwrap_or(BookDatabase { books: Vec::new() });

    // Chỉ check sách không hidden
    let books: Vec<&BookEntry> = db.books.iter().filter(|b| !b.hidden).collect();
    let total = books.len();

    // Emit bắt đầu
    let _ = app_handle.emit("duplicate_progress", serde_json::json!({
        "current": 0, "total": total, "done": false
    }));

    let mut hash_map: HashMap<String, Vec<BookEntry>> = HashMap::new();

    for (i, book) in books.iter().enumerate() {
        // Tính SHA1 nội dung file
        let hash = match std::fs::read(&book.path) {
            Ok(bytes) => {
                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                format!("{:x}", hasher.finalize())
            }
            Err(_) => continue, // Bỏ qua file không đọc được
        };

        hash_map.entry(hash).or_default().push((*book).clone());

        // Emit progress mỗi 10 file để không spam
        if i % 10 == 0 {
            let _ = app_handle.emit("duplicate_progress", serde_json::json!({
                "current": i + 1, "total": total, "done": false
            }));
        }
    }

    // Emit xong
    let _ = app_handle.emit("duplicate_progress", serde_json::json!({
        "current": total, "total": total, "done": true
    }));

    // Chỉ trả về nhóm có > 1 sách
    let mut groups: Vec<DuplicateGroup> = hash_map
        .into_iter()
        .filter(|(_, books)| books.len() > 1)
        .map(|(hash, books)| DuplicateGroup { file_hash: hash, books })
        .collect();

    // Sort theo tên file của sách đầu tiên trong nhóm
    groups.sort_by(|a, b| {
        a.books[0].file_name.to_lowercase().cmp(&b.books[0].file_name.to_lowercase())
    });

    Ok(groups)
}

// ===== EXPORT / IMPORT =====
// Backup toàn bộ database ra file JSON (kể cả sách hidden)
// Dùng để chuyển thư viện sang máy khác hoặc backup

// Export toàn bộ folders + books ra file JSON
pub fn export_database(
    app_handle: tauri::AppHandle,
    save_path: String,
) -> Result<String, String> {
    let dir = app_dir(&app_handle)?;

    let folders = {
        let p = dir.join("database.json");
        if p.exists() {
            let mut s = String::new();
            File::open(&p)
                .map_err(|e| e.to_string())?
                .read_to_string(&mut s)
                .map_err(|e| e.to_string())?;
            serde_json::from_str::<FolderDatabase>(&s)
                .unwrap_or(FolderDatabase { folders: Vec::new() })
                .folders
        } else {
            Vec::new()
        }
    };

    let books = {
        let p = dir.join("library_books.json");
        if p.exists() {
            let mut s = String::new();
            File::open(&p)
                .map_err(|e| e.to_string())?
                .read_to_string(&mut s)
                .map_err(|e| e.to_string())?;
            serde_json::from_str::<BookDatabase>(&s)
                .unwrap_or(BookDatabase { books: Vec::new() })
                .books
        } else {
            Vec::new()
        }
    };

    let backup = BackupData {
        version: 1,
        exported_at: current_timestamp(),
        folders: folders.clone(),
        books: books.clone(),
    };

    std::fs::write(
        &save_path,
        serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(format!(
        "Exported {} sách, {} folder → {}",
        books.len(),
        folders.len(),
        save_path
    ))
}

// Import backup từ file JSON vào app
// Ghi đè toàn bộ database hiện tại
// Sau khi import cần bấm "Update Database" để render lại thumbnail
pub fn import_database(
    app_handle: tauri::AppHandle,
    source_path: String,
) -> Result<String, String> {
    let mut s = String::new();
    File::open(&source_path)
        .map_err(|e| format!("Không mở được file: {}", e))?
        .read_to_string(&mut s)
        .map_err(|e| e.to_string())?;

    let backup: BackupData =
        serde_json::from_str(&s).map_err(|e| format!("File không hợp lệ: {}", e))?;

    let dir = app_dir(&app_handle)?;

    std::fs::write(
        dir.join("database.json"),
        serde_json::to_string_pretty(&FolderDatabase {
            folders: backup.folders.clone(),
        })
        .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    std::fs::write(
        dir.join("library_books.json"),
        serde_json::to_string_pretty(&BookDatabase {
            books: backup.books.clone(),
        })
        .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(format!(
        "Imported {} sách, {} folder. Bấm Update Database để render thumbnail.",
        backup.books.len(),
        backup.folders.len()
    ))
}