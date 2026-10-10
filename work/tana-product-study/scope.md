# Case Scope

## meta
- case_id: tana-product-study
- created: 2026-10-10T18:38:05+08:00
- operator: local
- project_root: /Volumes/mac/local-tana-app
- primary_skill: reverse-engineering/SKILL.md
- primary_id: R0
- lead_role: lead
- specialist_roles: []
- hint: study original Tana product behavior and align current app functionality and interaction
- preset: none

## auth
- status: granted
- basis: explicit_user_request
- evidence_of_auth: "User explicitly requested installing REA and using it for complete reverse learning of the original Tana app."

## in_scope
- assets:
  - /Applications/Tana Outliner.app
  - https://outliner.tana.inc/
- surfaces:
  - native_macos_ui
  - public_documentation
  - public_browser_runtime
- activities:
  - passive_ui_observation
  - bounded_ui_scenarios
  - static_frontend_artifact_analysis

## out_of_scope
- assets: []
- activities: [dos, phishing_real_users, unrestricted_exfil]

## network_profile
- mode: authorized_target_only
- notes: |
    offline | lab_only | authorized_target_only | unrestricted_lab
    Change mode only after auth.status = granted.
    Presets: offline-sample | ctf-public | own-system

## deliverables
- report: true
- field_journal: true
- diagrams: true
- timeline: true

## constraints
- timebox: {}
- stealth: low
- data_handling: anonymize

## signoff
- ready_for_act: false
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed
  - [ ] roles assigned (see skills/ops/role-map.md)

## ops_refs
- skills/ops/scope-contract.md
- skills/ops/evidence-finding-path.md
- skills/ops/role-map.md
- skills/ops/timeline-workitem.md
- skills/ops/IDENTITY.md
