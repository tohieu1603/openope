; Agent Operis BytePlus NSIS custom installer script

; ── Actual uninstall actions ──
!macro customUnInstall
  ; Clean up auto-start registry (different key from default edition)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AgentOpериsByteplus"
!macroend
