; Agent Operis NSIS custom installer script

; ── Uninstall init: ask user about config deletion ──
!macro customUnInit
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to delete all configuration and data files?$\n$\n\
This includes your API tokens, chat history, and all settings.$\n\
Location: $PROFILE\.openclaw$\n$\n\
Click YES to delete everything (fresh start).$\n\
Click NO to keep your data." \
    IDYES deleteConfig IDNO skipDelete

  deleteConfig:
    RMDir /r "$PROFILE\.openclaw"
    Goto configDone

  skipDelete:

  configDone:
!macroend

; ── Actual uninstall actions ──
!macro customUnInstall
  ; Clean up auto-start registry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AgentOperis"
!macroend
