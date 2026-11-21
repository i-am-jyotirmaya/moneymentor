package com.spndrr.devicecredential

import android.app.Activity
import android.app.KeyguardManager
import android.content.ActivityNotFoundException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SpndrrDeviceCredentialModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("SpndrrDeviceCredential")

    AsyncFunction("authenticate") { promise: Promise ->
      val activity = appContext.currentActivity
      val keyguard = activity?.getSystemService(KeyguardManager::class.java)
      if (activity == null || keyguard == null || !keyguard.isDeviceSecure) {
        promise.resolve("unavailable")
        return@AsyncFunction
      }
      if (pending != null) {
        promise.resolve("failed")
        return@AsyncFunction
      }
      // This asks for the device credential without offering biometric authentication.
      @Suppress("DEPRECATION")
      val intent = keyguard.createConfirmDeviceCredentialIntent("Unlock Spndrr", null)
      if (intent == null) {
        promise.resolve("unavailable")
        return@AsyncFunction
      }
      pending = promise
      try {
        @Suppress("DEPRECATION")
        activity.startActivityForResult(intent, DEVICE_CREDENTIAL_REQUEST)
      } catch (_: ActivityNotFoundException) {
        pending = null
        promise.resolve("unavailable")
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, (requestCode, resultCode, _) ->
      if (requestCode == DEVICE_CREDENTIAL_REQUEST) {
        val promise = pending
        pending = null
        promise?.resolve(if (resultCode == Activity.RESULT_OK) "success" else "cancelled")
      }
    }
  }

  private companion object {
    const val DEVICE_CREDENTIAL_REQUEST = 24081
  }
}
