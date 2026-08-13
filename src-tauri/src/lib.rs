// Flow Evolver — adaptive focus timer.
// Rust side only hosts the SQL plugin + migrations; all timer logic lives in the frontend.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
