Pod::Spec.new do |s|
  s.name = 'MoreChatCodeExec'
  s.version = '1.0.0'
  s.summary = 'MoreChat script execution module for Expo'
  s.homepage = 'https://bellard.org/quickjs/'
  s.license = 'UNLICENSED'
  s.author = 'MoreChat'
  s.source = { :path => '.' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = '*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'MoreChatQuickJS'
end
