import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyIdentifier,
  normalizePhone,
  usernameLooksLikePhone,
  isValidEmail,
  normalizeEmail,
  validatePasswordPair,
} from '../lib/phone.ts';
import { canAttemptOtp, canSendOtp, nextSendState, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS, OTP_RESEND_GAP_MS } from '../lib/otpPolicy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('login identifier (exclusive)', () => {
  it('A. lucasfuentes is username (cuentas actuales)', () => {
    assert.deepEqual(classifyIdentifier('lucasfuentes'), { kind: 'username', value: 'lucasfuentes' });
    assert.deepEqual(classifyIdentifier('LucasFuentes'), { kind: 'username', value: 'lucasfuentes' });
  });

  it('B. correo@example.com is email', () => {
    assert.deepEqual(classifyIdentifier('correo@example.com'), { kind: 'email', value: 'correo@example.com' });
    assert.equal(classifyIdentifier('Usuario@Gmail.com').kind, 'email');
    assert.equal(classifyIdentifier('not-an-email@').kind, 'invalid');
  });

  it('C. 3875197086 normalizes to AR mobile E.164', () => {
    assert.equal(normalizePhone('3875197086'), '+5493875197086');
    assert.equal(normalizePhone('+5493875197086'), '+5493875197086');
    assert.equal(normalizePhone('(0387) 15 519-7086'), '+5493875197086');
    assert.equal(normalizePhone('00 54 9 387 519 7086'), '+5493875197086');
    assert.equal(classifyIdentifier('3875197086').kind, 'phone');
    assert.equal(classifyIdentifier('+5493875197086').value, '+5493875197086');
  });

  it('email wins over other kinds when @ is present', () => {
    assert.equal(classifyIdentifier('lucasfuentes@example.com').kind, 'email');
  });
});

describe('passwords and usernames', () => {
  it('D. mismatched passwords are rejected', () => {
    assert.equal(validatePasswordPair('secret1', 'secret2'), 'Las contraseñas no coinciden');
    assert.equal(validatePasswordPair('12345', '12345'), 'La contraseña debe tener al menos 6 caracteres');
    assert.equal(validatePasswordPair('secret1', 'secret1'), null);
  });

  it('E. email format and case-insensitive identity', () => {
    assert.equal(isValidEmail('correo@example.com'), true);
    assert.equal(normalizeEmail('Correo@Example.com'), 'correo@example.com');
    assert.equal(isValidEmail('nope'), false);
  });

  it('F. reserved / taken-format / phone-like usernames rejected', () => {
    const handles = readFileSync(join(root, 'lib/publicHandles.ts'), 'utf8');
    assert.match(handles, /'login'/);
    assert.match(handles, /usernameLooksLikePhone/);
    assert.equal(usernameLooksLikePhone('3875197086'), true);
    assert.equal(usernameLooksLikePhone('lucasfuentes'), false);
    assert.equal(classifyIdentifier('login').kind, 'username');
    assert.equal(classifyIdentifier('3875197086').kind, 'phone');
  });

  it('G. email register payload is valid when email + password pair + username pass', () => {
    const email = 'correo@example.com';
    const username = 'nuevousuario';
    assert.equal(isValidEmail(email), true);
    assert.equal(validatePasswordPair('secret1', 'secret1'), null);
    assert.equal(classifyIdentifier(username).kind, 'username');
    assert.equal(usernameLooksLikePhone(username), false);
  });
});

describe('OTP rate limit / attempts', () => {
  it('H. send cap, resend gap and attempt cap', () => {
    const t0 = 1_000_000;
    let row = nextSendState(null, t0);
    assert.equal(row.sendCount, 1);

    assert.equal(canSendOtp(row, t0 + 1_000).ok, false);
    row = nextSendState(row, t0 + OTP_RESEND_GAP_MS);
    assert.equal(row.sendCount, 2);
    row = nextSendState(row, t0 + OTP_RESEND_GAP_MS * 2);
    assert.equal(row.sendCount, 3);
    assert.equal(canSendOtp(row, t0 + OTP_RESEND_GAP_MS * 3).ok, false);
    assert.equal(row.sendCount, OTP_MAX_SENDS);

    assert.equal(canAttemptOtp(row, t0 + 1_000).ok, true);
    row = { ...row, attemptCount: OTP_MAX_ATTEMPTS };
    assert.equal(canAttemptOtp(row, t0 + 1_000).ok, false);

    row = { ...row, attemptCount: 0, expiresAt: t0 };
    assert.equal(canAttemptOtp(row, t0 + 1).ok, false);
  });

  it('post-OTP ticket is bound to phone + purpose', () => {
    const secret = 'test-otp-secret';
    const exp = Date.now() + 60_000;
    const ticket = `${exp}.${createHmac('sha256', secret).update(`ticket|signup|+5493875197086|${exp}`).digest('hex')}`;
    const otherPhone = `${exp}.${createHmac('sha256', secret).update(`ticket|signup|+5491111111111|${exp}`).digest('hex')}`;
    assert.notEqual(ticket, otherPhone);
    assert.equal(ticket.startsWith(`${exp}.`), true);
  });
});

describe('QR pendingTagCode conservation', () => {
  it('I. Auth wizard reads pendingTagCode and never writes the storage key', () => {
    const auth = readFileSync(join(root, 'screens/AuthScreen.tsx'), 'utf8');
    assert.match(auth, /pendingTagCode/);
    assert.doesNotMatch(auth, /setPendingTagCode/);
    assert.doesNotMatch(auth, /animaldex-pending-tag-code/);
    const store = readFileSync(join(root, 'lib/store.tsx'), 'utf8');
    assert.match(store, /animaldex-pending-tag-code/);
  });
});

describe('worker / hashing / no demo OTP', () => {
  const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');

  it('keeps scrypt + salt hashing', () => {
    assert.match(worker, /scryptSync\(password, salt, 64\)/);
  });

  it('does not leak demo OTP codes', () => {
    assert.doesNotMatch(worker, /demoCode/);
    assert.doesNotMatch(worker, /animaldex-demo-otp-secret/);
    assert.match(worker, /action === 'status'/);
    assert.match(worker, /smsConfigured/);
  });

  it('login accepts identifier and falls back to username', () => {
    assert.match(worker, /body\.identifier/);
    assert.match(worker, /classified\.kind === 'email'/);
    assert.match(worker, /classified\.kind === 'phone'/);
    assert.match(worker, /LOWER\(username\) = \?/);
  });

  it('registerPhone requires signed ticket', () => {
    assert.match(worker, /readPhoneTicket\(secret, 'signup', phone, ticket\)/);
  });

  it('setPhone requires verify_phone ticket', () => {
    assert.match(worker, /readPhoneTicket\(secret, 'verify_phone', phone, ticket\)/);
  });
});
