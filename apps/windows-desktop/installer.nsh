; Agent Operis NSIS custom installer script
; Clean up auto-start registry entry on uninstall

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AgentOperis"
!macroend
