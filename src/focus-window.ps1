# Okur — basligi verilen metni iceren ilk gorunur pencereyi one getirir.
# Kullanim: powershell -NoProfile -ExecutionPolicy Bypass -File focus-window.ps1 "para-app"
# VS Code pencere basligi klasor adini icerir ("dosya - para-app - Visual Studio Code"),
# bu yuzden proje adiyla arama yeterlidir.
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

  public static string FocusByTitle(string needle) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      string t = sb.ToString();
      // Kendi penceremizi atla, once VS Code pencerelerini tercih et
      if (t.Length == 0 || t == "Okur") return true;
      if (t.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) {
        bool isCode = t.IndexOf("Visual Studio Code", StringComparison.OrdinalIgnoreCase) >= 0;
        if (isCode) { found = h; return false; } // VS Code -> hemen al
        if (found == IntPtr.Zero) found = h;      // degilse aday olarak tut
      }
      return true;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return "notfound";
    if (IsIconic(found)) ShowWindow(found, 9); // SW_RESTORE
    SetForegroundWindow(found);
    return "ok";
  }
}
"@

[OkurWin]::FocusByTitle($Needle)
