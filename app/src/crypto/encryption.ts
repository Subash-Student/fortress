import CryptoJS from 'crypto-js';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

export function encrypt(plaintext: string, key: string): EncryptedPayload {
  const iv = CryptoJS.lib.WordArray.random(16);
  const keyWords = CryptoJS.enc.Hex.parse(key);

  const encrypted = CryptoJS.AES.encrypt(plaintext, keyWords, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Hex),
  };
}

export function decrypt(ciphertext: string, iv: string, key: string): string {
  const keyWords = CryptoJS.enc.Hex.parse(key);
  const ivWords = CryptoJS.enc.Hex.parse(iv);
  const ciphertextWords = CryptoJS.enc.Base64.parse(ciphertext);

  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: ciphertextWords,
  });

  const decrypted = CryptoJS.AES.decrypt(cipherParams, keyWords, {
    iv: ivWords,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

export function generateKey(): string {
  return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
}

export function deriveKey(password: string, salt: string): string {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 1000,
  }).toString(CryptoJS.enc.Hex);
}
