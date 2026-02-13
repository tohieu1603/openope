; Agent Operis NSIS custom installer script

; ── Actual uninstall actions ──
!macro customUnInstall
  ; Clean up auto-start registry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AgentOperis"
!macroend
