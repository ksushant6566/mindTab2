require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'SharedKeychain'
  s.version        = package['version']
  s.summary        = 'Expo module for shared keychain access via App Groups'
  s.homepage       = 'https://mindtab.in'
  s.license        = 'MIT'
  s.author         = 'MindTab'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
end
