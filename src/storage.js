// Simple storage layer backed by the browser's localStorage.
// Mirrors the shape of window.storage (get/set/delete/list) so the rest
// of the app didn't need to change. Data lives only in this browser: it
// does not sync across devices and is not encrypted at rest beyond what
// the app itself does (passwords are hashed before they reach here).

const NAMESPACE = "gestorGastos:v1";

function readAll() {
  try {
    const raw = localStorage.getItem(NAMESPACE);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function writeAll(data) {
  localStorage.setItem(NAMESPACE, JSON.stringify(data));
}

export const storage = {
  async get(key) {
    const data = readAll();
    if (!(key in data)) return null;
    return { key, value: data[key] };
  },
  async set(key, value) {
    const data = readAll();
    data[key] = value;
    writeAll(data);
    return { key, value };
  },
  async delete(key) {
    const data = readAll();
    if (!(key in data)) return null;
    delete data[key];
    writeAll(data);
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const data = readAll();
    return { keys: Object.keys(data).filter((k) => k.startsWith(prefix)) };
  },
};
