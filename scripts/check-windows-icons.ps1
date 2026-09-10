param([string]$Executable = 'C:\Users\valer\AppData\Local\Lotus\lotus.exe')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LotusIconCheck {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] public static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint count);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
}
'@
$lotusResolved = (Resolve-Path -LiteralPath $Executable).Path
$lotusIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($lotusResolved)
if (!$lotusIcon) { throw 'Executable has no associated icon' }
$lotusImage = $lotusIcon.ToBitmap()
$lotusImage.Save((Join-Path $PSScriptRoot '..\artifacts\lotus-0100-executable-icon.png'))
$lotusImage.Dispose()
$lotusIcon.Dispose()
$lotusShell = New-Object -ComObject WScript.Shell
$lotusLink = $lotusShell.CreateShortcut('C:\Users\valer\Desktop\Lotus.lnk')
if (!(Test-Path -LiteralPath $lotusLink.TargetPath)) { throw 'Desktop shortcut target is missing' }
$lotusIconPath = $lotusLink.IconLocation -replace ',\d+$',''
if (!(Test-Path -LiteralPath $lotusIconPath)) { throw 'Desktop shortcut icon is missing' }
$lotusLarge = New-Object IntPtr[] 1
$lotusSmall = New-Object IntPtr[] 1
$lotusCount = [LotusIconCheck]::ExtractIconEx($lotusIconPath,0,$lotusLarge,$lotusSmall,1)
if ($lotusCount -lt 1) { throw 'Cannot extract desktop shortcut icon' }
foreach ($lotusHandle in @($lotusLarge[0],$lotusSmall[0])) { if ($lotusHandle -ne [IntPtr]::Zero) { [LotusIconCheck]::DestroyIcon($lotusHandle) | Out-Null } }
$lotusWindows = @(Get-Process lotus -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0)
$lotusWindowResults = foreach ($lotusProcess in $lotusWindows) {
  $lotusHandle = [LotusIconCheck]::SendMessage($lotusProcess.MainWindowHandle,0x7F,[IntPtr]1,[IntPtr]::Zero)
  if ($lotusHandle -eq [IntPtr]::Zero) { $lotusHandle = [LotusIconCheck]::SendMessage($lotusProcess.MainWindowHandle,0x7F,[IntPtr]0,[IntPtr]::Zero) }
  if ($lotusHandle -eq [IntPtr]::Zero) { throw 'Running Lotus window has no explicit icon' }
  $lotusWindowIcon = [System.Drawing.Icon]::FromHandle($lotusHandle)
  $lotusBitmap = $lotusWindowIcon.ToBitmap()
  $lotusBitmap.Save((Join-Path $PSScriptRoot '..\artifacts\lotus-0100-window-icon.png'))
  $lotusBitmap.Dispose()
  [pscustomobject]@{ ProcessId=$lotusProcess.Id; Path=$lotusProcess.Path; WindowIcon=$lotusHandle.ToInt64() }
}
[pscustomobject]@{ Version=(Get-Item -LiteralPath $lotusResolved).VersionInfo.FileVersion; ShortcutTarget=$lotusLink.TargetPath; ShortcutIcon=$lotusLink.IconLocation; ExtractedIcons=$lotusCount; Windows=$lotusWindowResults } | ConvertTo-Json -Depth 4
