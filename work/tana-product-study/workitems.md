# Work Items

| ID | title | role | targets | surface | status | evidence | notes |
|----|-------|------|---------|---------|--------|----------|-------|
| WI-001 | Establish scope and auth | lead | case | process | completed | user request | Scope granted for local Tana app and public documentation |
| WI-002 | Capture native baseline and sidebar states | lead | /Applications/Tana Outliner.app | native_macos_ui | completed | `ev_c276c631...`, `ev_4352714...`, `ev_128db08...`, `ev_842f388...` | Three-state navigation cycle observed |
| WI-003 | Inspect view controls and field menus | lead | Tana Outliner window 4241 | native_macos_ui | completed | `ev_0972918...`, `ev_77b21201...`, `ev_0df0f7a...`, `ev_230ac644...`, `ev_f6dd390...` | Display, Group, Sort and Search AST/operator controls observed through UI and rechecked through MCP |
| WI-004 | Static shipped-bundle analysis | lead | Tana Outliner app resources | javascript_bundle | partial | `analyze-javascript-application` limitation | CLI exhausted Node heap at both 4GB and 8GB; restarted MCP retry returned `Transport closed`; no static coverage claim made |

## Coverage
- [x] Recon/analysis complete for the bounded native UI surface
- [ ] Critical/High candidates triaged (or N/A for pure RE)
- [ ] Validated findings have Evidence (E-*)
- [ ] Path documented (attack/call/solve)
- [x] Timeline continuous across major phases
- [x] Report recorded in `docs/tana-reverse-study.md`
- [x] Field timeline recorded in `timeline.md`

## Refs
- skills/ops/timeline-workitem.md
- skills/ops/evidence-finding-path.md
