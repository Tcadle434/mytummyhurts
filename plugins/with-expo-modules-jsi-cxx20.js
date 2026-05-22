const { withPodfile } = require('@expo/config-plugins');

const expoModulesJsiCxx20Pattern =
  /target\.name\s*==\s*['"]ExpoModulesJSI['"][\s\S]{0,500}CLANG_CXX_LANGUAGE_STANDARD/;

const cxx20Snippet = `    # React Native 0.83 JSI headers require C++17+ std::string::data().
    installer.pods_project.targets.each do |target|
      next unless target.name == 'ExpoModulesJSI'

      target.build_configurations.each do |build_configuration|
        build_configuration.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
      end
    end
`;

function withExpoModulesJsiCxx20(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    if (expoModulesJsiCxx20Pattern.test(contents)) {
      return config;
    }

    const reactNativePostInstallPattern = /(react_native_post_install\([\s\S]*?^\s{4}\)\n)/m;
    if (!reactNativePostInstallPattern.test(contents)) {
      throw new Error('Could not find react_native_post_install in ios/Podfile.');
    }

    config.modResults.contents = contents.replace(
      reactNativePostInstallPattern,
      `$1\n${cxx20Snippet}`,
    );
    return config;
  });
}

module.exports = withExpoModulesJsiCxx20;
