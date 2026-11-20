package com.spndrr.passkeys

import android.os.Build
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialCancellationException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SpndrrPasskeysModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SpndrrPasskeys")

    Function("isSupported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.P }

    AsyncFunction("create") Coroutine { json: String ->
      val activity = requireNotNull(appContext.currentActivity)
      try {
        val result = CredentialManager.create(activity)
          .createCredential(activity, CreatePublicKeyCredentialRequest(json))
        (result as CreatePublicKeyCredentialResponse).registrationResponseJson
      } catch (_: CreateCredentialCancellationException) {
        null
      }
    }

    AsyncFunction("get") Coroutine { json: String ->
      val activity = requireNotNull(appContext.currentActivity)
      try {
        val request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(json)))
        val result = CredentialManager.create(activity).getCredential(activity, request)
        (result.credential as PublicKeyCredential).authenticationResponseJson
      } catch (_: GetCredentialCancellationException) {
        null
      }
    }
  }
}
