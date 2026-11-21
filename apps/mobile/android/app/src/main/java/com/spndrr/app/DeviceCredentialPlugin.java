package com.spndrr.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SpndrrDeviceCredential")
public class DeviceCredentialPlugin extends Plugin {
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void authenticate(PluginCall call) {
        KeyguardManager keyguard = getActivity().getSystemService(KeyguardManager.class);
        Intent intent = keyguard != null && keyguard.isDeviceSecure()
            ? keyguard.createConfirmDeviceCredentialIntent("Unlock Spndrr", null) : null;
        if (intent == null) {
            resolve(call, "unavailable");
            return;
        }
        startActivityForResult(call, intent, "onCredentialResult");
    }

    @ActivityCallback
    private void onCredentialResult(PluginCall call, ActivityResult result) {
        if (call != null) resolve(call, result.getResultCode() == Activity.RESULT_OK ? "success" : "cancelled");
    }

    private void resolve(PluginCall call, String status) {
        JSObject response = new JSObject();
        response.put("status", status);
        call.resolve(response);
    }
}
