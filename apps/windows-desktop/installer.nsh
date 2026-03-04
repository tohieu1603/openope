; Agent Operis NSIS custom installer script
; NOTE: This file is included BEFORE MUI2.nsh by electron-builder.
; All MUI-dependent code must go inside macros (expanded AFTER MUI2 loads).

!include "nsDialogs.nsh"
!include "FileFunc.nsh"

; Suppress NSIS warnings for variables/functions referenced inside macros/callbacks
!pragma warning disable 6010
!pragma warning disable 6001

Var DataDir
Var DataDirInput
Var DataDirBrowseBtn

; ── Data directory page (after install dir selection) ──
; electron-builder expands this inside !ifndef BUILD_UNINSTALLER, after MUI2.nsh is loaded.
; All Functions must be defined here so MUI_HEADER_TEXT macro is available.
!macro customPageAfterChangeDir
  Page custom dataDirPageCreate dataDirPageLeave

  Function dataDirPageCreate
    !insertmacro MUI_HEADER_TEXT "Data Directory" "Choose where to store your workspace, skills, and cron data."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ; Default: Desktop\OperisAgent
    StrCpy $DataDir "$DESKTOP\OperisAgent"

    ${NSD_CreateLabel} 0 0 100% 28u "Select the folder where Agent Operis will store your data (workspace, skills, cron).$\n$\nDefault: $DESKTOP\OperisAgent"
    Pop $0

    ${NSD_CreateDirRequest} 0 40u 75% 12u "$DataDir"
    Pop $DataDirInput

    ${NSD_CreateBrowseButton} 77% 39u 23% 14u "Browse..."
    Pop $DataDirBrowseBtn
    ${NSD_OnClick} $DataDirBrowseBtn onBrowseDataDir

    nsDialogs::Show
  FunctionEnd

  Function dataDirPageLeave
    ; Read final value from input (user may have typed manually)
    ${NSD_GetText} $DataDirInput $DataDir

    ; Strip trailing backslash for consistent comparison
    StrCpy $R0 $DataDir "" -1
    ${If} $R0 == "\"
      StrLen $R0 $DataDir
      IntOp $R0 $R0 - 1
      StrCpy $DataDir $DataDir $R0
    ${EndIf}

    ; Always ensure path ends with \OperisAgent
    StrCpy $R0 $DataDir "" -12  ; last 12 chars = "\OperisAgent"
    ${If} $R0 != "\OperisAgent"
      StrCpy $DataDir "$DataDir\OperisAgent"
    ${EndIf}
  FunctionEnd

  Function onBrowseDataDir
    nsDialogs::SelectFolderDialog "Select OperisAgent Data Directory" "$DataDir"
    Pop $0
    ${If} $0 != error
      StrCpy $DataDir $0
      ${NSD_SetText} $DataDirInput $DataDir
    ${EndIf}
  FunctionEnd

  ; String replace utility (used by customInstall)
  ; Replaces all occurrences of $R1 in $R0 with $R2
  Function StrReplace
    Exch $R2 ; replacement
    Exch 1
    Exch $R1 ; search
    Exch 2
    Exch $R0 ; input
    Push $R3
    Push $R4
    Push $R5
    StrLen $R3 $R1
    StrCpy $R5 ""
    loop:
      StrCpy $R4 $R0 $R3
      StrCmp $R4 "" done
      StrCmp $R4 $R1 found
      ; Extract first char into $R4, then append to $R5
      StrCpy $R4 $R0 1
      StrCpy $R5 "$R5$R4"
      StrCpy $R0 $R0 "" 1
      Goto loop
    found:
      StrCpy $R5 "$R5$R2"
      StrCpy $R0 $R0 "" $R3
      Goto loop
    done:
      StrCpy $R0 "$R5$R0"
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
  FunctionEnd
!macroend

; ── Write seed file + create data dir after install ──
!macro customInstall
  ; Guard: skip seed if DataDir is empty (e.g., silent install)
  StrCmp $DataDir "" skip_seed

  ; Ensure ~/.operis/ exists
  CreateDirectory "$PROFILE\.operis"

  ; Create data directory
  CreateDirectory "$DataDir"

  ; Write installer seed file with forward slashes for JSON/Node.js compat
  FileOpen $0 "$PROFILE\.operis\installer-seed.json" w
  ; Convert backslashes to forward slashes for JSON
  StrCpy $R0 $DataDir
  Push $R0
  Push "\"
  Push "/"
  Call StrReplace
  Pop $R0
  FileWrite $0 '{"userDataDir":"$R0"}'
  FileClose $0

  skip_seed:
!macroend

; ── Actual uninstall actions ──
!macro customUnInstall
  ; Clean up auto-start registry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AgentOperis"
!macroend
