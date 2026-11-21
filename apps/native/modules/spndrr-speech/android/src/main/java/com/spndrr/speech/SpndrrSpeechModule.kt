package com.spndrr.speech

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SpndrrSpeechModule : Module() {
  private var recognizer: SpeechRecognizer? = null
  private var pending: Promise? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { finish(error = "No speech result. Please try again.") }

  private fun finish(text: String? = null, error: String? = null) {
    val promise = pending ?: return
    pending = null
    handler.removeCallbacks(timeout)
    recognizer?.destroy()
    recognizer = null
    if (error != null) promise.reject("ERR_SPEECH", error, null) else promise.resolve(text)
  }

  override fun definition() = ModuleDefinition {
    Name("SpndrrSpeech")
    AsyncFunction("recognize") { locale: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || !SpeechRecognizer.isRecognitionAvailable(context)) {
        promise.reject("ERR_SPEECH", "Speech recognition is unavailable on this device.", null)
        return@AsyncFunction
      }
      if (pending != null) {
        promise.reject("ERR_SPEECH", "Speech recognition is already running.", null)
        return@AsyncFunction
      }
      pending = promise
      try {
        val service = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = service
        service.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {}
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(rmsdB: Float) {}
          override fun onBufferReceived(buffer: ByteArray?) {}
          override fun onEndOfSpeech() {}
          override fun onPartialResults(partialResults: Bundle?) {}
          override fun onEvent(eventType: Int, params: Bundle?) {}
          override fun onError(error: Int) {
            if (recognizer !== service) return
            finish(error = when (error) {
              SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech recognized. Please try again."
              SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
              else -> "Speech recognition failed. Please try again or type your message."
            })
          }
          override fun onResults(results: Bundle?) {
            if (recognizer !== service) return
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
            if (text.isNullOrBlank()) finish(error = "No speech recognized. Please try again.") else finish(text)
          }
        })
        service.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        })
        handler.postDelayed(timeout, 30000)
      } catch (error: Exception) {
        finish(error = "Could not start speech recognition.")
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stop") { recognizer?.stopListening(); Unit }.runOnQueue(Queues.MAIN)
    AsyncFunction("cancel") { finish(); Unit }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground { handler.post { finish() } }
    OnActivityDestroys { handler.post { finish() } }
    OnDestroy { handler.post { finish() } }
  }
}
