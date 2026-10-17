/*
  The like plumbing.

  Only the pure parts are exercised here. Everything that touches Supabase belongs in the
  soak on the branch deploy, because a mocked database that agrees with itself proves
  nothing about a unique index.

  What is worth pinning down is the validation, because both validators guard a write to a
  table with a unique index on four columns, and the address hash, because it is the one
  piece of reader data the site touches at all.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { isTargetKind, isLikeTarget, isTargetKey, hashIp } from '../src/lib/reader.ts';

test('only content pages can be comment targets', () => {
  assert.equal(isTargetKind('content'), true);
  assert.equal(isTargetKind('disaster'), false);
});

test('a kind that is not in the enum is refused before it reaches Postgres', () => {
  for (const bad of ['article', 'video', 'comment', 'Content', '', null, undefined, 7, {}]) {
    assert.equal(isTargetKind(bad), false, `${String(bad)} should not be a kind`);
  }
});

test('likes are limited to content pages and comments', () => {
  assert.equal(isLikeTarget('content'), true);
  assert.equal(isLikeTarget('comment'), true);
  assert.equal(isLikeTarget('disaster'), false);
});

test('a key keeps its collection prefix or is a comment id', () => {
  assert.equal(isTargetKey('blog:the-traps-of-nullable-in-c-sharp'), true);
  assert.equal(isTargetKey('videos:dQw4w9WgXcQ'), true);
  assert.equal(isTargetKey('12'), true);
  assert.equal(isTargetKey('nested/path/id'), true);
});

test('a key that is punctuation, empty, or novel length is refused', () => {
  for (const bad of ['', '-leading-dash', ':leading-colon', 'has space', 'quote"', "tick'", 'semi;colon', '<script>']) {
    assert.equal(isTargetKey(bad), false, `${bad} should not be a key`);
  }
});

test('a key longer than a real key is refused', () => {
  assert.equal(isTargetKey('a'.repeat(128)), true);
  assert.equal(isTargetKey('a'.repeat(129)), false);
});

test('the same address always hashes to the same token', () => {
  assert.equal(hashIp('203.0.113.7', 's3cret'), hashIp('203.0.113.7', 's3cret'));
});

test('two addresses do not collide', () => {
  assert.notEqual(hashIp('203.0.113.7', 's3cret'), hashIp('203.0.113.8', 's3cret'));
});

test('the hash never contains the address it came from', () => {
  assert.equal(hashIp('203.0.113.7', 's3cret').includes('203.0.113.7'), false);
});

test('rotating the secret forgets who liked what', () => {
  assert.notEqual(hashIp('203.0.113.7', 'old'), hashIp('203.0.113.7', 'new'));
});

test('with no secret set, the address half collapses instead of pretending to protect', () => {
  assert.equal(hashIp('203.0.113.7', undefined), 'no-secret');
  assert.equal(hashIp('198.51.100.1', ''), 'no-secret');
});
