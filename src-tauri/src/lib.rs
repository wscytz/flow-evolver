// Flow Evolver — adaptive focus timer.
// Rust side only hosts the SQL plugin + migrations; all timer logic lives in the frontend.

/// Diagnostics hook: appends a line to a file so we can reconstruct the exact
/// state sequence when a user reports a freeze. Logged lines are just state
/// dumps — no sensitive data.
#[tauri::command]
fn log_diag(msg: String) {
    if let Some(home) = std::env::var_os("HOME") {
        let path = std::path::Path::new(&home).join("Library/Logs/flow-evolver-diag.log");
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            use std::io::Write;
            let _ = writeln!(f, "{}", msg);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:flow-evolver.db",
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "create sessions table",
                            sql: include_str!("./migrations/001_init.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 2,
                            description: "create settings table",
                            sql: include_str!("./migrations/002_settings.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![log_diag])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
