Pod::Spec.new do |s|
  s.name = 'SpndrrDeviceCredential'
  s.version = '1.0.0'
  s.summary = 'Spndrr device passcode authentication'
  s.homepage = 'https://spndrr.com'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Spndrr'
  s.source = { :git => 'https://github.com/i-am-jyotirmaya/moneymentor.git' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
end
