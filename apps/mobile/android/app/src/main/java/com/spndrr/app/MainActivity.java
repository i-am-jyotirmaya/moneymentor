package com.spndrr.app;

import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static {
        // Forces the light configuration before any activity is created, so the
        // DayNight theme, WebView, and Capacitor SystemBars' DEFAULT style all
        // resolve to light even when the system is dark (audit E2).
        // Remove in the dark-mode PR.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
    }
}
