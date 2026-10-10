# Work Items

| ID | title | role | targets | surface | status | evidence | notes |
|----|-------|------|---------|---------|--------|----------|-------|
| WI-001 | Establish scope and auth | lead | case | process | completed | user request | Scope granted for local Tana app and public documentation |
| WI-002 | Capture native baseline and sidebar states | lead | /Applications/Tana Outliner.app | native_macos_ui | completed | E-001..E-004 | Three-state navigation cycle observed |
| WI-003 | Inspect view controls and field menus | lead | Tana Outliner window 4241 | native_macos_ui | completed | E-005 | Display, Group, Sort controls observed through UI |
| WI-004 | Static shipped-bundle analysis | lead | Tana Outliner app resources | javascript_bundle | partial | limitation | Parser exhausted Node heap; retry requires a narrower artifact or provider fix |

## Coverage
- [ ] Recon/analysis complete for in_scope assets
- [ ] Critical/High candidates triaged (or N/A for pure RE)
- [ ] Validated findings have Evidence (E-*)
- [ ] Path documented (attack/call/solve)
- [x] Timeline continuous across major phases
- [ ] Report via docs-generator
- [ ] field-journal anonymized

## Refs
- skills/ops/timeline-workitem.md
- skills/ops/evidence-finding-path.md
