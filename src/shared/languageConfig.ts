"use strict";

const ALIAS: Readonly<Partial<Record<string, string>>> = {
  proto3: "proto",
};

export { ALIAS };

export const SUPPORTED_LANGUAGES = [
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

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export interface StyleOverride {
  fallbackStyle?: string;
  description?: string;
}

export const STYLE_OVERRIDES: Readonly<Partial<Record<string, StyleOverride>>> = {
  csharp: { fallbackStyle: "Microsoft" },
  javascript: { fallbackStyle: "google" },
  typescript: { fallbackStyle: "google" },
  textproto: { description: "enable formatting for textproto files" },
  metal: { description: "enable formatting for Metal Shader Files" },
};

export const DISPLAY_NAMES = {
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
} as const satisfies Readonly<Record<string, string>>;
