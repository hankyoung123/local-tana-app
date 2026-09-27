use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn open_capture_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("clipper") {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "clipper", WebviewUrl::App("clipper".into()))
        .title("Global Capture")
        .inner_size(520.0, 300.0)
        .min_inner_size(360.0, 220.0)
        .resizable(true)
        .always_on_top(true)
        .build()?;
    Ok(())
}

fn capture_shortcut() -> Shortcut {
    #[cfg(target_os = "macos")]
    { Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space) }
    #[cfg(not(target_os = "macos"))]
    { Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(
            GlobalShortcutBuilder::new()
                .with_handler(|app, shortcut, event| {
                    if shortcut == &capture_shortcut() && event.state() == ShortcutState::Pressed {
                        let _ = open_capture_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.global_shortcut().register(capture_shortcut())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::capture_shortcut;

    #[test]
    fn global_capture_uses_the_platform_space_chord() {
        let rendered = capture_shortcut().to_string();
        assert!(rendered.contains("shift"), "{rendered}");
        assert!(rendered.contains("Space"), "{rendered}");
        #[cfg(target_os = "macos")]
        assert!(rendered.contains("super"), "{rendered}");
        #[cfg(not(target_os = "macos"))]
        assert!(rendered.contains("Control"), "{rendered}");
    }
}
