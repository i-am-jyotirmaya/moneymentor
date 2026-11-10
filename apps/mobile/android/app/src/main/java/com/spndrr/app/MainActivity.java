package com.spndrr.app;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Forces the light configuration (theme, WebView, and Capacitor SystemBars'
        // DEFAULT style, which reads the activity's uiMode) so status/nav bar icons
        // are dark on the light bars even when the system is in dark mode (audit E2).
        // Remove in the dark-mode PR.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
    }
}
