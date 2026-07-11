' Okur'u konsol penceresi olmadan baslatir.
' Masaustu kisayolu bu dosyayi hedefler; cift tikla -> Okur acilir.
' (Zaten acsa ikinci kopya acilmaz, mevcut pencere one gelir.)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Electron bulunamadi. Once proje klasorunde 'npm install' calistir.", 48, "Okur"
  WScript.Quit 1
End If
Set shell = CreateObject("WScript.Shell")
' Bazi ortamlarin ELECTRON_RUN_AS_NODE kalintisi arayuzu engeller; temizle.
On Error Resume Next
shell.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
On Error Goto 0
shell.Run """" & exe & """ """ & dir & """", 0, False
