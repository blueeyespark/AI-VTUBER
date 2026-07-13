Option Explicit
Dim shell, fso, scriptFolder, repoRoot, startCmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptFolder = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptFolder))
startCmd = repoRoot & "\START_BLUE.cmd"
shell.Run Chr(34) & startCmd & Chr(34), 0, False
