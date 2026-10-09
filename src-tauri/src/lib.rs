use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
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

fn build_application_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let file = SubmenuBuilder::new(app, "文件")
        .text("tana.new-node", "新建节点")
        .text("tana.quick-add", "Quick Add")
        .separator()
        .close_window_with_text("关闭窗口")
        .build()?;
    let edit = SubmenuBuilder::new(app, "编辑")
        .text("tana.undo", "撤销")
        .text("tana.redo", "重做")
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let node = SubmenuBuilder::new(app, "节点")
        .text("tana.duplicate", "复制当前节点")
        .text("tana.toggle-done", "切换完成状态")
        .text("tana.trash", "移到回收站")
        .separator()
        .text("tana.collapse-node", "折叠当前节点")
        .text("tana.expand-node", "展开当前节点")
        .build()?;
    let field = SubmenuBuilder::new(app, "字段")
        .text("tana.open-field-inspector", "打开字段检查器")
        .build()?;
    let navigate = SubmenuBuilder::new(app, "导航")
        .text("tana.search", "搜索节点")
        .text("tana.open-command-palette", "命令面板…")
        .separator()
        .text("tana.today", "打开今天")
        .text("tana.navigate-back", "返回上一页")
        .text("tana.navigate-forward", "前进到下一页")
        .text("tana.navigate-root", "返回工作区")
        .text("tana.copy-link", "复制当前页面链接")
        .build()?;
    let view = SubmenuBuilder::new(app, "视图")
        .text("tana.toggle-sidebar", "切换侧栏")
        .text("tana.toggle-inspector", "显示或隐藏检查器")
        .build()?;
    let window = SubmenuBuilder::new(app, "窗口")
        .close_window_with_text("关闭窗口")
        .build()?;
    let help = SubmenuBuilder::new(app, "帮助").about(None).build()?;

    MenuBuilder::new(app)
        .items(&[&file, &edit, &node, &field, &navigate, &view, &window, &help])
        .build()
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
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let Some(command) = id.strip_prefix("tana.") else {
                return;
            };
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("tana-menu-command", command);
            }
        })
        .setup(|app| {
            app.set_menu(build_application_menu(&app.handle())?)?;
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
