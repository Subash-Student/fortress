Pod::Spec.new do |s|
  s.name           = 'ExpenseSmsReaderModule'
  s.version        = '0.1.0'
  s.summary        = 'Reads the Android SMS inbox for expense capture (no-op on iOS, which has no SMS access API)'
  s.description    = 'Reads the Android SMS inbox for expense capture (no-op on iOS, which has no SMS access API)'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
