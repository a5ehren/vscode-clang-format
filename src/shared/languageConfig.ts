"use strict";

export const ALIAS: Readonly<Record<string, string>> = {
  proto3: "proto",
} as const;

export type SupportedLanguage =
  | "cpp"
  | "c"
  | "csharp"
  | "objective-c"
  | "objective-cpp"
  | "java"
  | "javascript"
  | "json"
  | "typescript"
  | "proto"
  | "proto3"
  | "textproto"
  | "apex"
  | "glsl"
  | "hlsl"
  | "cuda"
  | "cuda-cpp"
  | "tablegen"
  | "metal"
  | "verilog"
  | "systemverilog";

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  "cpp",
  "c",
  "csharp",
  "objective-c",
  "objective-cpp",
  "java",
  "javascript",
  "json",
  "typescript",
  "proto",
  "proto3",
  "textproto",
  "apex",
  "glsl",
  "hlsl",
  "cuda",
  "cuda-cpp",
  "tablegen",
  "metal",
  "verilog",
  "systemverilog",
] as const;

export type StyleOverride = {
  fallbackStyle?: string;
  description?: string;
};

export const STYLE_OVERRIDES: Readonly<Record<string, StyleOverride>> = {
  csharp: { fallbackStyle: "Microsoft" },
  javascript: { fallbackStyle: "google" },
  typescript: { fallbackStyle: "google" },
  textproto: { description: "enable formatting for textproto files" },
  metal: { description: "enable formatting for Metal Shader Files" },
} as const;

export const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  cpp: "C++",
  c: "C",
  csharp: "C#",
  "objective-c": "Objective-C",
  "objective-cpp": "Objective-C++",
  java: "Java",
  javascript: "JavaScript",
  typescript: "TypeScript",
  proto: "Protobuf",
  proto3: "Protobuf",
  textproto: "textproto",
  apex: "Apex",
  glsl: "GLSL",
  hlsl: "HLSL",
  cuda: "CUDA",
  "cuda-cpp": "CUDA C++",
  tablegen: "TableGen",
  metal: "Metal Shader Files",
  verilog: "Verilog",
  systemverilog: "SystemVerilog",
  json: "JSON",
} as const;
