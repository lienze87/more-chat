Pod::Spec.new do |s|
  s.name = 'MoreChatQuickJS'
  s.version = '2026.6.4'
  s.summary = 'QuickJS engine for MoreChat'
  s.homepage = 'https://bellard.org/quickjs/'
  s.license = { :type => 'MIT', :file => 'LICENSE' }
  s.author = 'Fabrice Bellard and contributors'
  # Same upstream revision as quickjs-kt 1.0.19.
  s.source = {
    :http => 'https://codeload.github.com/bellard/quickjs/tar.gz/25197744030a9659b5a6e6f861ae78981b5fce07',
    :sha256 => '20c2b0ec115b8cc234d16fde42c7b5984f04aa48b924849d045579d6fd0e581b',
    :type => :tgz
  }
  s.platform = :ios, '16.4'
  s.source_files = 'quickjs.c', 'dtoa.c', 'libregexp.c', 'libunicode.c', 'cutils.c', '*.h'
  s.public_header_files = 'quickjs.h'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) _GNU_SOURCE CONFIG_VERSION=\"2026-06-04\"',
    'OTHER_CFLAGS' => '$(inherited) -fwrapv'
  }
end
