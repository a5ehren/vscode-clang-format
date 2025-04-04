import * as fs from "fs";
import * as path from "path";
import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  ALIAS,
  STYLE_OVERRIDES,
  DISPLAY_NAMES,
  StyleOverride,
} from "../shared/languageConfig";

interface PackageJson {
  activationEvents: string[];
  contributes: {
    configuration: {
      properties: Record<string, unknown>;
    };
  };
}

function generateLanguageConfig(lang: SupportedLanguage): Record<string, unknown> {
  const baseKey = `clang-format.language.${ALIAS[lang] || lang}`;
  const displayName = DISPLAY_NAMES[lang];
  const override: StyleOverride = STYLE_OVERRIDES[lang] ?? {};

  return {
    [`${baseKey}.enable`]: {
      type: "boolean",
      default: true,
      description:
        override.description ??
        `enable formatting for ${displayName} (requires reloading Extensions)`,
    },
    [`${baseKey}.style`]: {
      type: "string",
      default: "",
      description: `clang-format style for ${displayName}, leave empty to use global clang-format.style`,
      scope: "resource",
    },
    [`${baseKey}.fallbackStyle`]: {
      type: "string",
      default: override.fallbackStyle ?? "",
      description: `clang-format fallback style for ${displayName}, leave empty to use clang-format.fallbackStyle`,
      scope: "resource",
    },
  };
}

function generateActivationEvents(): string[] {
  return SUPPORTED_LANGUAGES.map((lang) => `onLanguage:${lang}`);
}

function main() {
  // Read the existing package.json
  const packageJsonPath = path.join(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;

  // Generate language configurations
  const languageConfigs = SUPPORTED_LANGUAGES.reduce<Record<string, unknown>>((acc, lang) => {
    return { ...acc, ...generateLanguageConfig(lang) };
  }, {});

  // Generate activation events
  packageJson.activationEvents = generateActivationEvents();

  // Merge with existing configuration properties
  packageJson.contributes.configuration.properties = {
    "clang-format.executable":
      packageJson.contributes.configuration.properties[
        "clang-format.executable"
      ],
    "clang-format.executable.windows":
      packageJson.contributes.configuration.properties[
        "clang-format.executable.windows"
      ],
    "clang-format.executable.linux":
      packageJson.contributes.configuration.properties[
        "clang-format.executable.linux"
      ],
    "clang-format.executable.osx":
      packageJson.contributes.configuration.properties[
        "clang-format.executable.osx"
      ],
    "clang-format.style":
      packageJson.contributes.configuration.properties["clang-format.style"],
    "clang-format.fallbackStyle":
      packageJson.contributes.configuration.properties[
        "clang-format.fallbackStyle"
      ],
    ...languageConfigs,
    "clang-format.assumeFilename":
      packageJson.contributes.configuration.properties[
        "clang-format.assumeFilename"
      ],
  };

  // Write back to package.json with consistent formatting
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + "\n",
  );
}

main();
