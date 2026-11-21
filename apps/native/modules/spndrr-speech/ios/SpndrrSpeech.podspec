Pod::Spec.new do |s|
  s.name = 'SpndrrSpeech'
  s.version = '1.0.0'
  s.summary = 'Native speech input for Spndrr'
  s.description = s.summary
  s.license = 'UNLICENSED'
  s.author = 'Spndrr'
  s.homepage = 'https://spndrr.com'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/i-am-jyotirmaya/moneymentor.git' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'Speech', 'AVFoundation'
end
