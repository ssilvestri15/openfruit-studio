!ifndef BUILD_UNINSTALLER
!macro preInit
  ${IfNot} ${Silent}
    InitPluginsDir
    File /oname=$PLUGINSDIR\setup.ps1 "${PROJECT_DIR}\installer\setup.ps1"
    File /oname=$PLUGINSDIR\setup.xaml "${PROJECT_DIR}\installer\setup.xaml"
    File /oname=$PLUGINSDIR\components.ps1 "${PROJECT_DIR}\installer\components.ps1"
    File /oname=$PLUGINSDIR\studio.ico "${PROJECT_DIR}\branding\openfruit-studio.ico"
    File /oname=$PLUGINSDIR\openfruit-studio-icon-512.png "${PROJECT_DIR}\branding\openfruit-studio-icon-512.png"
    Push $OUTDIR
    SetOutPath "$PLUGINSDIR\fonts"
    File "${PROJECT_DIR}\branding\fonts\Syne.ttf"
    File "${PROJECT_DIR}\branding\fonts\Syne-OFL.txt"
    File "${PROJECT_DIR}\branding\fonts\JetBrainsMono-Regular.ttf"
    File "${PROJECT_DIR}\branding\fonts\JetBrainsMono-OFL.txt"
    Pop $0
    SetOutPath "$0"
    StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
    ${If} ${FileExists} "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
      StrCpy $1 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
    ${EndIf}
    nsExec::ExecToLog '"$1" -NoProfile -STA -ExecutionPolicy Bypass -File "$PLUGINSDIR\setup.ps1" -Installer "$EXEPATH" -Version "${VERSION}" -AppFile "${APP_EXECUTABLE_FILENAME}" -AppFolder "${APP_FILENAME}" -RegistryKey "${INSTALL_REGISTRY_KEY}"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "Could not start OpenFruit Studio Setup."
      SetErrorLevel 1
    ${EndIf}
    Quit
  ${EndIf}
!macroend

!macro customInstall
  ${GetParameters} $R0
  ${GetOptions} $R0 "/studio-desktop=" $R1
  ${IfNot} ${Errors}
    ${If} $R1 == "0"
      Delete "$newDesktopLink"
      WinShell::UninstShortcut "$newDesktopLink"
    ${ElseIf} $R1 == "1"
    ${AndIfNot} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe"
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
  ${EndIf}
  ClearErrors
!macroend
!endif
