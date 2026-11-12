package com.spndrr.app;

import android.content.res.Configuration;
import android.webkit.WebView;
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

    // fontScale is in the manifest's configChanges, so a system font-size change keeps this
    // activity (and the current screen) instead of recreating it. WebView only reads the font
    // scale when it is created (textZoom 115 at 1.15, 130 at 1.3), so apply the new value here.
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) webView.getSettings().setTextZoom(Math.round(newConfig.fontScale * 100));
    }
}
