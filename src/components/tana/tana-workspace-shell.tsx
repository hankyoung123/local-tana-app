'use client';

import * as React from 'react';

/** Layout only: the editor and its document remain owned by Plate. */
export function TanaWorkspaceShell({
  children,
  focusMode,
  inspector,
  navigationOpen,
  onDismissNavigation,
  sidebar,
  toolbar,
}: {
  children: React.ReactNode;
  focusMode: boolean;
  inspector?: React.ReactNode;
  navigationOpen: boolean;
  onDismissNavigation: () => void;
  sidebar: React.ReactNode;
  toolbar: React.ReactNode;
}) {
  const [desktop, setDesktop] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    void import('@tauri-apps/api/core').then(({ isTauri }) => {
      if (mounted) setDesktop(isTauri());
    });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="tana-workspace-viewport">
      <div
        className="tana-workspace-shell"
        data-desktop={desktop || undefined}
        data-focus-mode={focusMode || undefined}
        data-navigation-open={navigationOpen || undefined}
      >
        <div aria-hidden="true" className="still-native-titlebar" data-tauri-drag-region />
        {navigationOpen && (
          <button
            aria-label="关闭侧栏导航"
            className="tana-navigation-scrim"
            type="button"
            onClick={onDismissNavigation}
          />
        )}
        {sidebar}
        <main aria-label="工作区" className="tana-workspace-main">
          {toolbar}
          <div className="tana-content-region">{children}</div>
        </main>
        {inspector}
      </div>
    </div>
  );
}
