' Silent entry point for the Rail Revenue Forecasting Dashboard.
'
' Double-clicking a .vbs file runs it under wscript.exe, which shows no
' window of its own. It then launches launch-dashboard.ps1 with
' -WindowStyle Hidden, so no PowerShell or console window ever appears --
' the only thing the user sees is the browser opening. This is the file a
' desktop shortcut should point to.

Dim fso, scriptDir, psScript, shell, command

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = fso.BuildPath(scriptDir, "launch-dashboard.ps1")

Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psScript & Chr(34)

' 0 = hidden window, False = don't wait for it to finish (the dashboard
' keeps running after this launcher exits).
shell.Run command, 0, False
