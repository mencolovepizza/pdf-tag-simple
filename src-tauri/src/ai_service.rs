use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

// =============================================
// AI SERVICE — Auto-tag sách bằng AI
//
// Hỗ trợ 2 provider:
//   OpenAI — online, filename + thumbnail
//   Ollama — local, filename only hoặc + thumbnail (vision model)
//
// Flow:
//   1. Frontend gọi ai_suggest_tags với danh sách books
//   2. Backend build prompt, gọi API
//   3. Trả về Vec<AiTagSuggestion> để frontend preview
//   4. User confirm → frontend gọi api.updateBook để apply
// =============================================

// ===== SETTINGS =====
// Lưu trong settings.json cùng thư mục với database.json

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiSettings {
    // Provider: "openai" | "ollama"
    pub provider: String,

    // OpenAI
    pub openai_api_key: String,
    pub openai_model: String,      // "gpt-4o-mini" là default

    // Ollama
    pub ollama_host: String,       // "http://localhost:11434"
    pub ollama_model: String,      // "llama3.2" hoặc "llava" cho vision

    // Input mode
    // "filename"  — chỉ dùng tên file (nhanh, rẻ)
    // "thumbnail" — tên file + ảnh bìa (chính xác hơn, cần vision model)
    pub input_mode: String,

    // Tag vocabulary — danh sách tag cho phép
    // Nếu rỗng → AI suggest tự do
    // Nếu có → AI chỉ dùng tags trong danh sách này
    pub tag_vocabulary: Vec<String>,

    // Skip sách đã có đủ tags
    pub skip_if_tags_gte: u32,     // Mặc định 5

    // Ngôn ngữ tag
    // "auto" — AI tự theo ngôn ngữ tên file
    // "en"   — luôn tag tiếng Anh
    // "vi"   — luôn tag tiếng Việt
    #[serde(default = "default_tag_language")]
    pub tag_language: String,
}

fn default_tag_language() -> String { "auto".to_string() }

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            openai_api_key: "".to_string(),
            openai_model: "gpt-4o-mini".to_string(),
            ollama_host: "http://localhost:11434".to_string(),
            ollama_model: "llama3.2".to_string(),
            input_mode: "filename".to_string(),
            tag_vocabulary: Vec::new(),
            skip_if_tags_gte: 5,
            tag_language: "auto".to_string(),
        }
    }
}

// ===== INPUT / OUTPUT =====

// Thông tin 1 sách gửi lên để AI tag
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BookToTag {
    pub path: String,
    pub file_name: String,
    pub thumbnail_path: String,  // Dùng khi input_mode = "thumbnail"
    pub current_tags: Vec<String>,
}

// Kết quả AI suggest cho 1 sách
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiTagSuggestion {
    pub path: String,
    pub file_name: String,
    pub suggested_tags: Vec<String>,
    pub error: Option<String>,  // Nếu có lỗi khi tag sách này
}

// ===== SETTINGS I/O =====

fn settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("ai_settings.json"))
}

pub fn get_ai_settings(app_handle: tauri::AppHandle) -> Result<AiSettings, String> {
    let path = settings_path(&app_handle)?;
    if !path.exists() {
        return Ok(AiSettings::default());
    }
    let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

pub fn save_ai_settings(
    app_handle: tauri::AppHandle,
    settings: AiSettings,
) -> Result<String, String> {
    let path = settings_path(&app_handle)?;
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok("Settings saved".to_string())
}

// ===== PROMPT BUILDER =====

fn build_prompt(file_name: &str, vocabulary: &[String], tag_language: &str) -> String {
    let vocab_instruction = if vocabulary.is_empty() {
        "Suggest 2-5 short, relevant tags.".to_string()
    } else {
        format!(
            "Preferred tag list: [{}]. \
            Use tags from this list when they fit. \
            You may add tags outside the list only if nothing in the list is a good match. \
            Suggest 2-5 tags total.",
            vocabulary.join(", ")
        )
    };

    let language_instruction = match tag_language {
        "en" => "All tags must be in English.",
        "vi" => "All tags must be in Vietnamese.",
        "zh" => "All tags must be in Chinese (Simplified).",
        "ja" => "All tags must be in Japanese.",
        "ko" => "All tags must be in Korean.",
        "es" => "All tags must be in Spanish.",
        "fr" => "All tags must be in French.",
        "de" => "All tags must be in German.",
        "id" => "All tags must be in Indonesian.",
        _    => "Use the same language as the filename.",
    };

    format!(
        "You are a librarian tagging PDF books. \
        Given the filename: \"{}\"\n\
        {}\n\
        Language rule: {}\n\
        Rules:\n\
        - Tags must be short (1-3 words max)\n\
        - No duplicates\n\
        - Series rule: if the filename clearly belongs to a named series followed by a number or volume \
        (e.g. \"My Pals Are Here 3\", \"DK Eyewitness Travel Paris\", \"Goosebumps 12\"), \
        add the series name as a tag WITHOUT the number (e.g. \"My Pals Are Here\", \"DK Eyewitness Travel\"). \
        Do NOT create series tags for standalone books (e.g. \"Nguyen Van 6\", \"Toan 7\") \
        where the number is just a grade level, not a volume in a named series.\n\
        - Respond with ONLY a JSON array of strings, nothing else.\n\
        Example response: [\"self-help\", \"productivity\", \"My Pals Are Here\"]",
        file_name, vocab_instruction, language_instruction
    )
}

// ===== THUMBNAIL HELPER =====

// Đọc thumbnail và encode base64 để gửi lên API
fn thumbnail_to_base64(thumbnail_path: &str) -> Option<String> {
    if thumbnail_path.is_empty() {
        return None;
    }
    let path = PathBuf::from(thumbnail_path);
    if !path.exists() {
        return None;
    }
    let bytes = std::fs::read(&path).ok()?;
    Some(general_purpose::STANDARD.encode(&bytes))
}

// ===== PARSE AI RESPONSE =====

// Parse JSON array từ response AI
// Handle case AI trả thêm text xung quanh
fn parse_tags_from_response(text: &str) -> Vec<String> {
    // Tìm JSON array trong response
    let start = text.find('[');
    let end = text.rfind(']');

    if let (Some(s), Some(e)) = (start, end) {
        let json_str = &text[s..=e];
        if let Ok(tags) = serde_json::from_str::<Vec<String>>(json_str) {
            return tags
                .into_iter()
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .collect();
        }
    }
    Vec::new()
}

// ===== OPENAI =====

async fn call_openai(
    api_key: &str,
    model: &str,
    prompt: &str,
    thumbnail_base64: Option<&str>,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();

    // Build message content — text only hoặc text + image
    let content = if let Some(b64) = thumbnail_base64 {
        serde_json::json!([
            {
                "type": "image_url",
                "image_url": {
                    "url": format!("data:image/jpeg;base64,{}", b64),
                    "detail": "low"  // low = rẻ hơn, đủ để tag
                }
            },
            {
                "type": "text",
                "text": prompt
            }
        ])
    } else {
        serde_json::json!([{ "type": "text", "text": prompt }])
    };

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": content
            }
        ],
        "max_tokens": 100,
        "temperature": 0.3  // Thấp = consistent hơn
    });

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI error {}: {}", status, text));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse response failed: {}", e))?;

    let text = data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("");

    Ok(parse_tags_from_response(text))
}

// ===== OLLAMA =====

async fn call_ollama(
    host: &str,
    model: &str,
    prompt: &str,
    thumbnail_base64: Option<&str>,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();

    // Ollama API: /api/chat
    // images field chỉ dùng khi model hỗ trợ vision
    let mut message = serde_json::json!({
        "role": "user",
        "content": prompt
    });

    if let Some(b64) = thumbnail_base64 {
        message["images"] = serde_json::json!([b64]);
    }

    let body = serde_json::json!({
        "model": model,
        "messages": [message],
        "stream": false,
        "options": {
            "temperature": 0.3,
            "num_predict": 100
        }
    });

    let url = format!("{}/api/chat", host.trim_end_matches('/'));

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}. Is Ollama running?", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama error {}: {}", status, text));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse response failed: {}", e))?;

    let text = data["message"]["content"].as_str().unwrap_or("");
    Ok(parse_tags_from_response(text))
}

// ===== MAIN ENTRY POINT =====
// Gọi từ main.rs → frontend

// Suggest tags cho 1 batch sách
// Trả về Vec<AiTagSuggestion> để frontend hiện preview
pub async fn suggest_tags_batch(
    app_handle: tauri::AppHandle,
    books: Vec<BookToTag>,
) -> Result<Vec<AiTagSuggestion>, String> {
    let settings = get_ai_settings(app_handle)?;

    // Validate
    if settings.provider == "openai" && settings.openai_api_key.is_empty() {
        return Err("OpenAI API key is not set. Please configure in AI Settings.".to_string());
    }

    let mut results = Vec::new();

    for book in books {
        // Skip nếu đã có đủ tags
        if book.current_tags.len() >= settings.skip_if_tags_gte as usize {
            continue;
        }

        let prompt = build_prompt(&book.file_name, &settings.tag_vocabulary, &settings.tag_language);

        // Chỉ load thumbnail nếu input_mode = "thumbnail"
        let thumbnail_b64 = if settings.input_mode == "thumbnail" {
            thumbnail_to_base64(&book.thumbnail_path)
        } else {
            None
        };

        let tag_result = match settings.provider.as_str() {
            "openai" => {
                call_openai(
                    &settings.openai_api_key,
                    &settings.openai_model,
                    &prompt,
                    thumbnail_b64.as_deref(),
                )
                .await
            }
            "ollama" => {
                call_ollama(
                    &settings.ollama_host,
                    &settings.ollama_model,
                    &prompt,
                    thumbnail_b64.as_deref(),
                )
                .await
            }
            _ => Err(format!("Unknown provider: {}", settings.provider)),
        };

        match tag_result {
            Ok(tags) => results.push(AiTagSuggestion {
                path: book.path,
                file_name: book.file_name,
                suggested_tags: tags,
                error: None,
            }),
            Err(e) => results.push(AiTagSuggestion {
                path: book.path,
                file_name: book.file_name,
                suggested_tags: Vec::new(),
                error: Some(e),
            }),
        }
    }

    Ok(results)
}

// Kiểm tra Ollama có đang chạy không
pub async fn check_ollama(host: &str) -> bool {
    let client = reqwest::Client::new();
    let url = format!("{}/api/tags", host.trim_end_matches('/'));
    client.get(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false)
}