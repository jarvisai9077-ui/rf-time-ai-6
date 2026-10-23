import * as Crypto from "expo-crypto";
import { storage } from "@/src/utils/storage";

// PIN is stored only as a salted SHA-256 hash in the OS secure store (Keystore-backed on Android).
const KEY = "tai_pin_hash";
export async function setPin(pin: string) {
  const salt = Crypto.randomUUID();
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + pin);
  return storage.secureSet(KEY, `${salt}:${hash}`);
}
export async function hasPin() { return !!(await storage.secureGet(KEY, null as string | null)); }
export async function checkPin(pin: string) {
  const v = await storage.secureGet(KEY, null as string | null);
  if (!v) return true;
  const [salt, hash] = String(v).split(":");
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + pin)) === hash;
}
export async function clearPin() { return storage.secureRemove(KEY); }
