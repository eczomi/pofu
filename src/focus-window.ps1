# Okur — basligi verilen metni iceren ilk gorunur pencereyi one getirir.
# Kullanim: powershell -NoProfile -ExecutionPolicy Bypass -File focus-window.ps1 "para-app"
# VS Code pencere basligi klasor adini icerir ("dosya - para-app - Visual Studio Code").
# Not: Windows, arka plan sureclerinin pencere one getirmesini kisitlar;
# Alt-tusu numarasi (keybd_event) bu kilidi acar.
param([Parameter(Mandatory=$true)][string]$Needle)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class OkurWin {
  private delegate bool EnumProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmd);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtra);

  public static string FocusByTitle(string needle) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      string t = sb.ToString();
      if (t.Length == 0 || t == "Okur") return true; // kendi penceremizi atla
      if (t.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) {
        bool isCode = t.IndexOf("Visual Studio Code", StringComparison.OrdinalIgnoreCase) >= 0;
        if (isCode) { found = h; return false; } // VS Code -> hemen al
        if (found == IntPtr.Zero) found = h;      // degilse aday olarak tut
      }
      return true;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return "notfound";
    if (IsIconic(found)) ShowWindow(found, 9); // SW_RESTORE
    // Alt-tusu numarasi: arka plan surecine one-getirme izni kazandirir
    keybd_event(0x12, 0, 0, UIntPtr.Zero);       // Alt bas
    SetForegroundWindow(found);
    BringWindowToTop(found);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);       // Alt birak
    return GetForegroundWindow() == found ? "ok" : "tried";
  }
}
"@

[OkurWin]::FocusByTitle($Needle)
