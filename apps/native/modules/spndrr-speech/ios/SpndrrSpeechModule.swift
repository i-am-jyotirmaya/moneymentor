import ExpoModulesCore
import Speech
import AVFoundation

public class SpndrrSpeechModule: Module {
  private var pending: Promise?
  private var generation = UUID()
  private var engine: AVAudioEngine?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var speechRecognizer: SFSpeechRecognizer?
  private var task: SFSpeechRecognitionTask?
  private var timeout: DispatchWorkItem?
  private var lastText = ""
  private var previousAudio: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

  public func definition() -> ModuleDefinition {
    Name("SpndrrSpeech")
    AsyncFunction("recognize") { (locale: String, promise: Promise) in
      guard self.pending == nil else {
        promise.reject("ERR_SPEECH", "Speech recognition is already running.")
        return
      }
      self.pending = promise
      self.generation = UUID()
      let id = self.generation
      SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
          guard self.generation == id, self.pending != nil else { return }
          guard status == .authorized else {
            self.finish(error: "Speech recognition permission is required.")
            return
          }
          let locales = locale == "en-IN" ? [locale, "en-GB", "en-AU", "en-CA"] : [locale]
          self.start(locales: locales[...], id: id)
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("stop") {
      if let request = self.request {
        self.engine?.stop()
        request.endAudio()
        self.task?.finish()
      } else { self.finish() }
    }.runOnQueue(.main)
    AsyncFunction("cancel") { self.finish() }.runOnQueue(.main)
    OnAppEntersBackground { DispatchQueue.main.async { self.finish() } }
    OnDestroy { DispatchQueue.main.async { self.finish() } }
  }

  private func start(locales: ArraySlice<String>, id: UUID) {
    guard let locale = locales.first else {
      finish(error: "Speech recognition is unavailable on this device.")
      return
    }
    let fallbackLocales = locales.dropFirst()
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.isAvailable else {
      start(locales: fallbackLocales, id: id)
      return
    }
    do {
      let session = AVAudioSession.sharedInstance()
      previousAudio = (session.category, session.mode, session.categoryOptions)
      try session.setCategory(.record, mode: .measurement)
      try session.setActive(true)
      let audioEngine = AVAudioEngine()
      let input = audioEngine.inputNode
      let format = input.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        finish(error: "Microphone is unavailable.")
        return
      }
      let audioRequest = SFSpeechAudioBufferRecognitionRequest()
      speechRecognizer = recognizer
      audioRequest.shouldReportPartialResults = true
      request = audioRequest
      input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in audioRequest.append(buffer) }
      engine = audioEngine
      lastText = ""
      task = recognizer.recognitionTask(with: audioRequest) { result, error in
        DispatchQueue.main.async {
          guard self.generation == id, self.pending != nil else { return }
          if let result = result {
            self.lastText = result.bestTranscription.formattedString
            if result.isFinal { self.complete(); return }
          }
          if let error = error as NSError? {
            // Apple reports missing assets (102) and recognizer initialization failures (300).
            if error.domain == "kLSRErrorDomain", error.code == 102 || error.code == 300,
               self.lastText.isEmpty, self.engine?.isRunning == true, !fallbackLocales.isEmpty {
              self.generation = UUID()
              self.resetCapture()
              self.start(locales: fallbackLocales, id: self.generation)
              return
            }
            self.finish(error: "Speech recognition failed. Please try again or type your message.")
          }
        }
      }
      audioEngine.prepare()
      try audioEngine.start()
      let deadline = DispatchWorkItem { [weak self] in self?.complete() }
      timeout = deadline
      DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: deadline)
    } catch {
      finish(error: "Could not start speech recognition.")
    }
  }

  private func complete() {
    if lastText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      finish(error: "No speech recognized. Please try again.")
    } else { finish(text: lastText) }
  }

  private func finish(text: String? = nil, error: String? = nil) {
    guard let promise = pending else { return }
    pending = nil
    resetCapture()
    if let error = error { promise.reject("ERR_SPEECH", error) } else { promise.resolve(text) }
  }

  private func resetCapture() {
    timeout?.cancel()
    timeout = nil
    if let engine = engine {
      engine.stop()
      engine.inputNode.removeTap(onBus: 0)
    }
    engine = nil
    request?.endAudio()
    request = nil
    task?.cancel()
    task = nil
    speechRecognizer = nil
    if let previous = previousAudio {
      let session = AVAudioSession.sharedInstance()
      try? session.setActive(false, options: .notifyOthersOnDeactivation)
      try? session.setCategory(previous.0, mode: previous.1, options: previous.2)
      previousAudio = nil
    }
    lastText = ""
  }
}
