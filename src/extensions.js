// Maps a Claude artifact's language/type metadata to a file extension.

// Common artifact languages -> extension. Covers the languages Claude
// labels code artifacts with; extend as needed.
const LANGUAGE_EXTENSIONS = {
  python: 'py',
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  jsx: 'jsx',
  tsx: 'tsx',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'cs',
  'c#': 'cs',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  scala: 'scala',
  bash: 'sh',
  shell: 'sh',
  sh: 'sh',
  powershell: 'ps1',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  markdown: 'md',
  md: 'md',
  r: 'r',
  julia: 'jl',
  dart: 'dart',
  lua: 'lua',
  perl: 'pl',
  haskell: 'hs',
  elixir: 'ex',
  clojure: 'clj',
};

// Artifact mime/types -> extension, used when there's no usable language.
const TYPE_EXTENSIONS = {
  'text/html': 'html',
  'text/markdown': 'md',
  'image/svg+xml': 'svg',
  'application/vnd.ant.mermaid': 'mmd',
  'application/vnd.ant.react': 'jsx',
};

export function extensionForArtifact({ type, language } = {}) {
  if (language) {
    const ext = LANGUAGE_EXTENSIONS[language.toLowerCase()];
    if (ext) return ext;
  }
  if (type && TYPE_EXTENSIONS[type]) {
    return TYPE_EXTENSIONS[type];
  }
  return 'txt';
}
