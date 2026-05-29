import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionForArtifact } from '../src/extensions.js';

test('maps a known language to its extension', () => {
  assert.equal(extensionForArtifact({ type: 'application/vnd.ant.code', language: 'python' }), 'py');
  assert.equal(extensionForArtifact({ type: 'application/vnd.ant.code', language: 'javascript' }), 'js');
  assert.equal(extensionForArtifact({ type: 'application/vnd.ant.code', language: 'typescript' }), 'ts');
});

test('maps artifact mime types to extensions', () => {
  assert.equal(extensionForArtifact({ type: 'text/html' }), 'html');
  assert.equal(extensionForArtifact({ type: 'text/markdown' }), 'md');
  assert.equal(extensionForArtifact({ type: 'image/svg+xml' }), 'svg');
  assert.equal(extensionForArtifact({ type: 'application/vnd.ant.mermaid' }), 'mmd');
  assert.equal(extensionForArtifact({ type: 'application/vnd.ant.react' }), 'jsx');
});

test('falls back to txt when type and language are unknown', () => {
  assert.equal(extensionForArtifact({}), 'txt');
  assert.equal(extensionForArtifact({ type: 'application/vnd.ant.code', language: 'made-up-lang' }), 'txt');
});

test('language takes precedence over a generic code type', () => {
  assert.equal(extensionForArtifact({ type: 'application/vnd.ant.code', language: 'rust' }), 'rs');
});
