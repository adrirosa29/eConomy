import { storage } from "./storage";
import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const PALETTE = {
  cover: "#15120E",
  coverSoft: "#1D1811",
  paper: "#221C15",
  paperDim: "#2C241A",
  ink: "#F2F4F5",
  inkSoft: "#B7BEC2",
  rule: "#3E4245",
  gold: "#C7CDD2",
  income: "#8FCB9B",
  incomeBg: "#22322A",
  expense: "#D98A66",
  expenseBg: "#332420",
};

const DEFAULT_CATEGORIES = {
  income: ["Nomina", "Intereses", "Hacienda", "Regalos", "Bizum", "Otros"],
  expense: ["Hogar", "Ocio", "Viajes", "Transporte", "Salud", "Otros"],
};

const DEFAULT_SUBCATEGORIES = {
  Hogar: ["Hipoteca", "Comunidad", "Factura Luz", "Factura Agua", "Factura Internet", "Ibi", "Seguro", "Decoracion", "Varios"],
  Ocio: ["Bares / Cafeteria", "Restaurantes", "Cine_Teatro", "Compras", "Suscripciones", "Loterias"],
  Viajes: ["Alojamiento", "Gasolina", "Peajes", "Transporte", "Restaurantes", "Actividades"],
  Transporte: ["Gasolina", "Parking", "Peajes", "Transporte Publico", "Itv", "Mantenimiento"],
  Salud: ["Consulta", "Cosmetica", "Medicamentos", "Seguro"],
  Otros: ["Impuestos", "Moda", "Tecnologia", "Estudios", "Regalos", "Varios"],
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const TODAY = new Date();
const CURRENT_YEAR = String(TODAY.getFullYear());
const CURRENT_MONTH_INDEX = TODAY.getMonth();

function capMonths(rows, year, hasData) {
  if (year !== CURRENT_YEAR) return rows;
  let lastWithData = -1;
  rows.forEach((r, i) => { if (hasData(r)) lastWithData = i; });
  const cutoff = Math.max(CURRENT_MONTH_INDEX, lastWithData) + 1;
  return rows.slice(0, cutoff);
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatMoney(n) {
  const v = Math.round(n * 100) / 100;
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}
function formatMoneyShort(n) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Math.round(n)) + " EUR";
}
function formatMoneyAxis(n) {
  return new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 }).format(Math.round(n));
}
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return new Intl.NumberFormat("es-ES").format(d.getDate()) + " " + MONTHS[d.getMonth()].slice(0, 3);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function randomSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + ":" + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function normUser(u) { return u.trim().toLowerCase(); }

const TABS = [
  { id: "registro", label: "Registro" },
  { id: "resumen", label: "Resumen" },
  { id: "categorias", label: "Detalle Gastos" },
];

function Mark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 26 C 10 12, 18 12, 20 20 C 22 28, 30 28, 36 14" fill="none" stroke={PALETTE.gold} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [authLoaded, setAuthLoaded] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginPass2, setLoginPass2] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [catConfig, setCatConfig] = useState(DEFAULT_CATEGORIES);
  const [subConfig, setSubConfig] = useState(DEFAULT_SUBCATEGORIES);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [activeTab, setActiveTab] = useState("registro");
  const [menuOpen, setMenuOpen] = useState(false);

  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [date, setDate] = useState(todayISO());
  const [formError, setFormError] = useState("");

  const [monthFilter, setMonthFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);

  const [resumenYear, setResumenYear] = useState("all");
  const [catYear, setCatYear] = useState("all");
  const [catSelected, setCatSelected] = useState(null);
  const [subSelected, setSubSelected] = useState(null);
  const [subExpanded, setSubExpanded] = useState(false);

  const [newCatName, setNewCatName] = useState({ income: "", expense: "" });
  const [subEditCategory, setSubEditCategory] = useState("");
  const [newSubName, setNewSubName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("app_users");
        if (res && res.value) setUsers(JSON.parse(res.value));
      } catch (e) {
        // no users yet
      } finally {
        setAuthLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (users.length === 0) { setSessionChecked(true); return; }
    (async () => {
      try {
        const res = await storage.get("session_user", false);
        if (res && res.value && users.some((u) => u.username === res.value)) {
          setCurrentUser(res.value);
        }
      } catch (e) {
        // no remembered session
      } finally {
        setSessionChecked(true);
      }
    })();
  }, [authLoaded, users]);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setDataLoaded(false);
      try {
        const tRes = await storage.get(`udata_${currentUser}_transactions`);
        setTransactions(tRes && tRes.value ? JSON.parse(tRes.value) : []);
      } catch (e) {
        setTransactions([]);
      }
      try {
        const cRes = await storage.get(`udata_${currentUser}_categories`);
        if (cRes && cRes.value) {
          const parsed = JSON.parse(cRes.value);
          setCatConfig(parsed.categories || DEFAULT_CATEGORIES);
          setSubConfig(parsed.subcategories || {});
        } else {
          setCatConfig(DEFAULT_CATEGORIES);
          setSubConfig(DEFAULT_SUBCATEGORIES);
          await storage.set(`udata_${currentUser}_categories`, JSON.stringify({ categories: DEFAULT_CATEGORIES, subcategories: DEFAULT_SUBCATEGORIES }));
        }
      } catch (e) {
        setCatConfig(DEFAULT_CATEGORIES);
        setSubConfig(DEFAULT_SUBCATEGORIES);
      } finally {
        setDataLoaded(true);
      }
    })();
  }, [currentUser]);

  useEffect(() => {
    if (catConfig.expense && catConfig.expense.length && !catConfig.expense.includes(category) && !catConfig.income.includes(category)) {
      setCategory(catConfig[type][0] || "");
    }
  }, [catConfig]);

  useEffect(() => {
    setCategory((catConfig[type] && catConfig[type][0]) || "");
    setSubcategory("");
  }, [type, catConfig]);

  async function persistTransactions(next) {
    setTransactions(next);
    try {
      const result = await storage.set(`udata_${currentUser}_transactions`, JSON.stringify(next));
      setStorageError(!result);
    } catch (e) {
      setStorageError(true);
    }
  }
  async function persistCategories(nextCats, nextSubs) {
    setCatConfig(nextCats);
    setSubConfig(nextSubs);
    try {
      const result = await storage.set(`udata_${currentUser}_categories`, JSON.stringify({ categories: nextCats, subcategories: nextSubs }));
      setStorageError(!result);
    } catch (e) {
      setStorageError(true);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setAuthError("");
    const uname = normUser(loginUser);
    if (uname.length < 3) { setAuthError("El usuario debe tener al menos 3 caracteres."); return; }
    if (loginPass.length < 4) { setAuthError("La contrasena debe tener al menos 4 caracteres."); return; }
    if (loginPass !== loginPass2) { setAuthError("Las contrasenas no coinciden."); return; }
    if (users.some((u) => u.username === uname)) { setAuthError("Ese usuario ya existe. Prueba a iniciar sesion."); return; }
    setAuthBusy(true);
    try {
      const salt = randomSalt();
      const hash = await hashPassword(loginPass, salt);
      const nextUsers = [...users, { username: uname, salt, hash, createdAt: todayISO() }];
      const result = await storage.set("app_users", JSON.stringify(nextUsers));
      if (!result) { setAuthError("No se pudo crear la cuenta. Intentalo de nuevo."); setAuthBusy(false); return; }
      setUsers(nextUsers);
      setCurrentUser(uname);
      setLoginPass(""); setLoginPass2("");
      try { await storage.set("session_user", uname, false); } catch (e) { /* ignore */ }
    } catch (e) {
      setAuthError("No se pudo crear la cuenta. Intentalo de nuevo.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const uname = normUser(loginUser);
    const user = users.find((u) => u.username === uname);
    if (!user) { setAuthError("No existe ese usuario. Puedes crear una cuenta nueva."); return; }
    setAuthBusy(true);
    try {
      const hash = await hashPassword(loginPass, user.salt);
      if (hash !== user.hash) { setAuthError("Contrasena incorrecta."); setAuthBusy(false); return; }
      setCurrentUser(uname);
      setLoginPass("");
      try { await storage.set("session_user", uname, false); } catch (e) { /* ignore */ }
    } catch (e) {
      setAuthError("No se pudo iniciar sesion. Intentalo de nuevo.");
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    setTransactions([]);
    setDataLoaded(false);
    setActiveTab("registro");
    setLoginUser(""); setLoginPass(""); setLoginPass2("");
    storage.delete("session_user", false).catch(() => {});
  }

  async function addTransaction(e) {
    e.preventDefault();
    const value = parseFloat(String(amount).replace(",", "."));
    if (!amount || isNaN(value) || value <= 0) { setFormError("Introduce un importe valido, mayor que cero."); return; }
    if (!date) { setFormError("Elige una fecha."); return; }
    if (!category) { setFormError("Elige una categoria."); return; }
    setFormError("");
    const entry = {
      id: uid(), type, amount: Math.round(value * 100) / 100,
      description: desc.trim() || category,
      category, subcategory: subcategory || "", date,
    };
    const next = [entry, ...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
    await persistTransactions(next);
    setAmount(""); setDesc(""); setSubcategory("");
  }

  async function removeTransaction(id) {
    await persistTransactions(transactions.filter((t) => t.id !== id));
  }

  async function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      const existingIds = new Set(transactions.map((t) => t.id));
      let added = 0, skipped = 0, invalid = 0;
      const newOnes = [];
      parsed.forEach((r, i) => {
        const amt = Number(r.amount);
        if (!r.date || !r.type || isNaN(amt) || !["income", "expense"].includes(r.type)) { invalid++; return; }
        const id = r.id || "imp_" + i + "_" + r.date + "_" + amt;
        if (existingIds.has(id)) { skipped++; return; }
        existingIds.add(id);
        newOnes.push({
          id, type: r.type, amount: Math.round(amt * 100) / 100,
          description: (r.description || r.category || "Movimiento importado").toString(),
          category: (r.category || "Otros").toString(),
          subcategory: (r.subcategory || "").toString(),
          date: String(r.date).slice(0, 10),
        });
        added++;
      });
      const next = [...newOnes, ...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
      await persistTransactions(next);
      let msg = `Importados ${added} movimientos nuevos.`;
      if (skipped) msg += ` ${skipped} ya existian.`;
      if (invalid) msg += ` ${invalid} filas no validas.`;
      setImportMsg(msg);
    } catch (err) {
      setImportMsg("No se pudo leer el archivo. Comprueba que es un JSON valido.");
    } finally {
      setImporting(false);
    }
  }

  // ---- category settings actions ----
  async function addCategory(kind) {
    const name = newCatName[kind].trim();
    if (!name) return;
    if (catConfig[kind].some((c) => c.toLowerCase() === name.toLowerCase())) {
      setNewCatName({ ...newCatName, [kind]: "" });
      return;
    }
    const next = { ...catConfig, [kind]: [...catConfig[kind], name] };
    await persistCategories(next, subConfig);
    setNewCatName({ ...newCatName, [kind]: "" });
  }
  async function removeCategory(kind, name) {
    const next = { ...catConfig, [kind]: catConfig[kind].filter((c) => c !== name) };
    await persistCategories(next, subConfig);
  }
  async function addSubcategory() {
    if (!subEditCategory || !newSubName.trim()) return;
    const name = newSubName.trim();
    const current = subConfig[subEditCategory] || [];
    if (current.some((s) => s.toLowerCase() === name.toLowerCase())) { setNewSubName(""); return; }
    const next = { ...subConfig, [subEditCategory]: [...current, name] };
    await persistCategories(catConfig, next);
    setNewSubName("");
  }
  async function removeSubcategory(cat, name) {
    const next = { ...subConfig, [cat]: (subConfig[cat] || []).filter((s) => s !== name) };
    await persistCategories(catConfig, next);
  }
  function usageCount(kind, name) {
    return transactions.filter((t) => t.type === kind && t.category === name).length;
  }

  // ---------- Registro tab derived data ----------
  const monthsAvailable = useMemo(() => {
    const set = new Set(transactions.map((t) => t.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [transactions]);
  const filtered = useMemo(() => transactions
    .filter((t) => {
      if (monthFilter !== "all" && t.date.slice(0, 7) !== monthFilter) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      return true;
    })
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)),
  [transactions, monthFilter, typeFilter]);
  function monthLabel(key) {
    if (key === "all") return "Todos los meses";
    const [y, m] = key.split("-");
    return MONTHS[parseInt(m, 10) - 1] + " " + y;
  }

  const TODAY_ISO = todayISO();
  const realized = useMemo(() => transactions.filter((t) => t.date <= TODAY_ISO), [transactions]);

  const yearsAvailable = useMemo(() => {
    const set = new Set(realized.map((t) => t.date.slice(0, 4)));
    return Array.from(set).sort().reverse();
  }, [realized]);

  const resumenRows = useMemo(() => {
    if (resumenYear === "all") {
      const map = {};
      realized.forEach((t) => {
        const y = t.date.slice(0, 4);
        if (!map[y]) map[y] = { label: y, income: 0, expense: 0 };
        map[y][t.type === "income" ? "income" : "expense"] += t.amount;
      });
      return Object.values(map).sort((a, b) => (a.label < b.label ? -1 : 1)).map((r) => ({ ...r, savings: r.income - r.expense }));
    }
    const rows = MONTHS_SHORT.map((m) => ({ label: m, income: 0, expense: 0 }));
    realized.forEach((t) => {
      if (t.date.slice(0, 4) !== resumenYear) return;
      const mi = parseInt(t.date.slice(5, 7), 10) - 1;
      rows[mi][t.type === "income" ? "income" : "expense"] += t.amount;
    });
    const capped = capMonths(rows, resumenYear, (r) => r.income > 0 || r.expense > 0);
    return capped.map((r) => ({ ...r, savings: r.income - r.expense }));
  }, [realized, resumenYear]);

  const resumenTotals = useMemo(() => {
    const income = resumenRows.reduce((s, r) => s + r.income, 0);
    const expense = resumenRows.reduce((s, r) => s + r.expense, 0);
    const savings = income - expense;
    return { income, expense, savings, rate: income > 0 ? (savings / income) * 100 : 0 };
  }, [resumenRows]);

  const catFiltered = useMemo(() => realized.filter((t) => {
    if (t.type !== "expense") return false;
    if (catYear !== "all" && t.date.slice(0, 4) !== catYear) return false;
    return true;
  }), [realized, catYear]);

  const catBreakdown = useMemo(() => {
    const map = {};
    catFiltered.forEach((t) => {
      if (!map[t.category]) map[t.category] = { category: t.category, total: 0, count: 0 };
      map[t.category].total += t.amount;
      map[t.category].count += 1;
    });
    const total = Object.values(map).reduce((s, c) => s + c.total, 0);
    return Object.values(map).map((c) => ({ ...c, pct: total ? (c.total / total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  }, [catFiltered]);
  const catTotal = catBreakdown.reduce((s, c) => s + c.total, 0);
  const maxCat = catBreakdown.length ? catBreakdown[0].total : 0;
  const activeCatName = catSelected || (catBreakdown[0] && catBreakdown[0].category) || null;

  const catTrend = useMemo(() => {
    if (!activeCatName) return [];
    const relevant = realized.filter((t) => t.type === "expense" && t.category === activeCatName);
    if (catYear === "all") {
      const map = {};
      relevant.forEach((t) => { const y = t.date.slice(0, 4); map[y] = (map[y] || 0) + t.amount; });
      return Object.entries(map).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([label, value]) => ({ label, value }));
    }
    const rows = MONTHS_SHORT.map((m) => ({ label: m, value: 0 }));
    relevant.forEach((t) => {
      if (t.date.slice(0, 4) !== catYear) return;
      const mi = parseInt(t.date.slice(5, 7), 10) - 1;
      rows[mi].value += t.amount;
    });
    return capMonths(rows, catYear, (r) => r.value > 0);
  }, [realized, catYear, activeCatName]);

  const subBreakdown = useMemo(() => {
    if (!activeCatName) return [];
    const relevant = catFiltered.filter((t) => t.category === activeCatName);
    const map = {};
    relevant.forEach((t) => {
      const key = t.subcategory && t.subcategory.trim() ? t.subcategory : "Sin subcategoria";
      if (!map[key]) map[key] = { subcategory: key, total: 0, count: 0 };
      map[key].total += t.amount;
      map[key].count += 1;
    });
    const total = Object.values(map).reduce((s, c) => s + c.total, 0);
    return Object.values(map).map((c) => ({ ...c, pct: total ? (c.total / total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  }, [catFiltered, activeCatName]);
  const maxSub = subBreakdown.length ? subBreakdown[0].total : 0;
  const visibleSubBreakdown = subExpanded ? subBreakdown : subBreakdown.slice(0, 5);

  const subTrend = useMemo(() => {
    if (!activeCatName || !subSelected) return [];
    const relevant = realized.filter((t) => {
      if (t.type !== "expense" || t.category !== activeCatName) return false;
      const key = t.subcategory && t.subcategory.trim() ? t.subcategory : "Sin subcategoria";
      return key === subSelected;
    });
    if (catYear === "all") {
      const map = {};
      relevant.forEach((t) => { const y = t.date.slice(0, 4); map[y] = (map[y] || 0) + t.amount; });
      return Object.entries(map).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([label, value]) => ({ label, value }));
    }
    const rows = MONTHS_SHORT.map((m) => ({ label: m, value: 0 }));
    relevant.forEach((t) => {
      if (t.date.slice(0, 4) !== catYear) return;
      const mi = parseInt(t.date.slice(5, 7), 10) - 1;
      rows[mi].value += t.amount;
    });
    return capMonths(rows, catYear, (r) => r.value > 0);
  }, [realized, catYear, activeCatName, subSelected]);

  const tooltipStyle = { background: PALETTE.paper, border: `1px solid ${PALETTE.rule}`, borderRadius: 3, fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12 };
  const allCategoryNames = useMemo(() => [...catConfig.expense, ...catConfig.income], [catConfig]);

  const sharedStyle = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');
      html, body { background: ${PALETTE.cover}; margin: 0; }
      .ledger-select, .ledger-input {
        font-family: 'IBM Plex Sans', sans-serif; background: transparent; border: none;
        border-bottom: 1px solid ${PALETTE.rule}; padding: 6px 2px; font-size: 14px; color: ${PALETTE.ink}; outline: none; width: 100%;
      }
      .ledger-input:focus, .ledger-select:focus { border-bottom: 1px solid ${PALETTE.gold}; }
      .ledger-row:hover .del-btn { opacity: 1; }
      .del-btn { opacity: 0; transition: opacity 0.15s ease; }
      .pill-btn {
        font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; padding: 6px 14px; border-radius: 3px;
        border: 1px solid ${PALETTE.rule}; background: transparent; cursor: pointer; color: ${PALETTE.inkSoft};
      }
      .pill-btn.active { background: ${PALETTE.ink}; color: ${PALETTE.paper}; border-color: ${PALETTE.ink}; }
      .type-toggle {
        font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; padding: 8px 18px; border: 1px solid ${PALETTE.rule};
        background: transparent; cursor: pointer; color: ${PALETTE.inkSoft};
      }
      .type-toggle.active-income { background: ${PALETTE.incomeBg}; color: ${PALETTE.income}; border-color: ${PALETTE.income}; }
      .type-toggle.active-expense { background: ${PALETTE.expenseBg}; color: ${PALETTE.expense}; border-color: ${PALETTE.expense}; }
      .submit-btn {
        font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; padding: 10px 22px; background: ${PALETTE.gold};
        color: #fff; border: none; border-radius: 3px; cursor: pointer;
      }
      .submit-btn:hover { filter: brightness(0.94); }
      .tab-btn {
        font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; padding: 9px 4px; background: none; border: none;
        border-bottom: 2px solid transparent; color: rgba(242,244,245,0.68); cursor: pointer;
      }
      .tab-btn.active { color: ${PALETTE.ink}; border-bottom: 2px solid ${PALETTE.gold}; }
      .cat-row { cursor: pointer; padding: 6px 8px; margin: 0 -8px; border-radius: 4px; transition: background 0.12s ease; }
      .cat-row:hover { background: ${PALETTE.paperDim}; }
      .cat-row:hover .cat-name { color: ${PALETTE.gold}; }
      .cat-row.selected { background: ${PALETTE.paperDim}; }
      .radio-dot { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid ${PALETTE.rule}; background: transparent; flex-shrink: 0; transition: background 0.12s ease, border-color 0.12s ease; }
      .cat-row:hover .radio-dot { border-color: ${PALETTE.gold}; }
      .cat-row.selected .radio-dot { border-color: ${PALETTE.gold}; background: ${PALETTE.gold}; }
      .chip-x {
        background: none; border: none; cursor: pointer; color: ${PALETTE.inkSoft}; font-size: 13px; margin-left: 6px;
      }
      .chip {
        display: inline-flex; align-items: center; background: ${PALETTE.paperDim}; border-radius: 3px;
        padding: 5px 8px 5px 10px; font-size: 13px; color: ${PALETTE.ink}; margin: 0 8px 8px 0;
      }
    `}</style>
  );

  // ---------------- Loading gate (avoids a login-screen flash) ----------------
  if (!authLoaded || !sessionChecked) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', Georgia, serif", background: PALETTE.cover, minHeight: "100vh" }}>
        {sharedStyle}
      </div>
    );
  }

  // ---------------- Auth screen ----------------
  if (!currentUser) {
    return (
      <div style={{ fontFamily: "'IBM Plex Sans', Georgia, serif", background: PALETTE.cover, minHeight: "100vh", color: PALETTE.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {sharedStyle}
        <div style={{ maxWidth: 380, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <Mark size={64} />
          </div>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 2, color: "rgba(242,244,245,0.68)", margin: "0 0 4px", textAlign: "center" }}>
            eConomy
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 500, fontSize: 26, color: PALETTE.ink, margin: "0 0 24px", textAlign: "center" }}>
            {authMode === "login" ? "Inicia sesion" : "Crea tu cuenta"}
          </h1>
          <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "28px 28px" }}>
            <form onSubmit={authMode === "login" ? handleLogin : handleRegister}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Usuario</label>
                <input className="ledger-input" type="text" autoCapitalize="none" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="p.ej. marta" />
              </div>
              <div style={{ marginBottom: authMode === "login" ? 8 : 16 }}>
                <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Contrasena</label>
                <input className="ledger-input" type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="min. 4 caracteres" />
              </div>
              {authMode === "register" && (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Repite la contrasena</label>
                  <input className="ledger-input" type="password" value={loginPass2} onChange={(e) => setLoginPass2(e.target.value)} />
                </div>
              )}
              {authError && <p style={{ color: PALETTE.expense, fontSize: 13, margin: "12px 0 0" }}>{authError}</p>}
              <button type="submit" className="submit-btn" style={{ width: "100%", marginTop: 20 }} disabled={authBusy || !authLoaded}>
                {authBusy ? "Un momento..." : authMode === "login" ? "Entrar" : "Crear cuenta"}
              </button>
            </form>
            <p style={{ textAlign: "center", fontSize: 13, marginTop: 16, color: PALETTE.inkSoft }}>
              {authMode === "login" ? "No tienes cuenta todavia? " : "Ya tienes cuenta? "}
              <button
                type="button"
                onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
                style={{ background: "none", border: "none", color: PALETTE.gold, cursor: "pointer", fontSize: 13, padding: 0 }}
              >
                {authMode === "login" ? "Crea una" : "Inicia sesion"}
              </button>
            </p>
          </div>
          <p style={{ fontSize: 11, color: "rgba(242,244,245,0.6)", marginTop: 18, textAlign: "center", lineHeight: 1.5 }}>
            Cada usuario tiene su propio registro, separado del resto. Es una separacion de datos pensada para
            varias personas usando la misma app, no un sistema de seguridad de nivel bancario.
          </p>
        </div>
      </div>
    );
  }

  // ---------------- Main app ----------------
  return (
    <div style={{ fontFamily: "'IBM Plex Sans', Georgia, serif", background: PALETTE.cover, minHeight: "100vh", color: PALETTE.ink }}>
      {sharedStyle}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>
        <header style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 1, color: "rgba(242,244,245,0.68)", margin: "0 0 4px" }}>
              {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 500, fontSize: 34, color: PALETTE.ink, margin: 0, display: "flex", alignItems: "center", gap: 12 }}>
              <Mark size={48} /> eConomy
            </h1>
          </div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu de cuenta"
              aria-expanded={menuOpen}
              style={{ background: "none", border: `1px solid ${PALETTE.rule}`, borderRadius: 4, width: 38, height: 38, color: PALETTE.inkSoft, fontSize: 17, cursor: "pointer", lineHeight: 1 }}
            >
              {"\u2699"}
            </button>
            {menuOpen && (
              <div style={{ position: "absolute", top: 46, right: 0, background: PALETTE.paper, border: `1px solid ${PALETTE.rule}`, borderRadius: 4, minWidth: 170, zIndex: 10, padding: "6px 0" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0, padding: "8px 14px", borderBottom: `1px solid ${PALETTE.rule}` }}>{currentUser}</p>
                <button
                  onClick={() => { setActiveTab("ajustes"); setMenuOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: PALETTE.ink, fontSize: 14, padding: "10px 14px", cursor: "pointer" }}
                >
                  Ajustes
                </button>
                <button
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: PALETTE.expense, fontSize: 14, padding: "10px 14px", cursor: "pointer" }}
                >
                  Cerrar sesion
                </button>
              </div>
            )}
          </div>
        </header>

        <nav style={{ display: "flex", gap: 24, borderBottom: `1px solid rgba(242,244,245,0.18)`, marginBottom: 24 }}>
          {TABS.map((t) => (
            <button key={t.id} className={"tab-btn" + (activeTab === t.id ? " active" : "")} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </nav>

        {activeTab === "registro" && (
          <>
            <section style={{ background: PALETTE.coverSoft, borderRadius: 4, padding: "16px 24px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <p style={{ fontSize: 13, color: PALETTE.ink, margin: "0 0 2px" }}>Importar movimientos</p>
                <p style={{ fontSize: 12, color: "rgba(242,244,245,0.72)", margin: 0 }}>{importMsg || "Sube un archivo .json exportado desde Excel para anadirlo a tu registro."}</p>
              </div>
              <label className="submit-btn" style={{ background: PALETTE.gold, cursor: "pointer", opacity: importing ? 0.6 : 1 }}>
                {importing ? "Importando..." : "Elegir archivo"}
                <input type="file" accept="application/json,.json" onChange={handleImportFile} disabled={importing} style={{ display: "none" }} />
              </label>
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 16px" }}>Nuevo movimiento</p>
              <div style={{ display: "flex", gap: 0, marginBottom: 18 }}>
                <button type="button" className={"type-toggle" + (type === "expense" ? " active-expense" : "")} style={{ borderRadius: "3px 0 0 3px" }} onClick={() => setType("expense")}>Gasto</button>
                <button type="button" className={"type-toggle" + (type === "income" ? " active-income" : "")} style={{ borderRadius: "0 3px 3px 0", borderLeft: "none" }} onClick={() => setType("income")}>Ingreso</button>
              </div>
              <form onSubmit={addTransaction}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Importe (EUR)</label>
                    <input className="ledger-input" type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Fecha</label>
                    <input className="ledger-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Categoria</label>
                    <select className="ledger-select" value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}>
                      {(catConfig[type] || []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Subcategoria (opcional)</label>
                    <select className="ledger-select" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!(subConfig[category] && subConfig[category].length)}>
                      <option value="">Ninguna</option>
                      {(subConfig[category] || []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Descripcion (opcional)</label>
                    <input className="ledger-input" type="text" placeholder="Cafe con Marta" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </div>
                </div>
                {formError && <p style={{ color: PALETTE.expense, fontSize: 13, margin: "0 0 12px" }}>{formError}</p>}
                <button type="submit" className="submit-btn">Anadir {type === "income" ? "ingreso" : "gasto"}</button>
              </form>
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Registro ({filtered.length})</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select className="pill-btn" style={{ cursor: "pointer" }} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                    <option value="all">Todos los meses</option>
                    {monthsAvailable.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                  <button className={"pill-btn" + (typeFilter === "all" ? " active" : "")} onClick={() => setTypeFilter("all")}>Todo</button>
                  <button className={"pill-btn" + (typeFilter === "income" ? " active" : "")} onClick={() => setTypeFilter("income")}>Ingresos</button>
                  <button className={"pill-btn" + (typeFilter === "expense" ? " active" : "")} onClick={() => setTypeFilter("expense")}>Gastos</button>
                </div>
              </div>

              {!dataLoaded ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>Cargando movimientos...</p>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: PALETTE.ink, margin: "0 0 4px" }}>El registro esta vacio</p>
                  <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Anade tu primer movimiento arriba para empezar a llevar la cuenta.</p>
                </div>
              ) : (
                <div>
                  {filtered.map((t) => (
                    <div key={t.id} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "44px 1fr auto 22px", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${PALETTE.rule}` }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: PALETTE.inkSoft }}>{formatDate(t.date)}</span>
                      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 14, color: PALETTE.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</span>
                        <span style={{ fontSize: 11, color: t.type === "income" ? PALETTE.income : PALETTE.expense, background: t.type === "income" ? PALETTE.incomeBg : PALETTE.expenseBg, padding: "2px 7px", borderRadius: 3, alignSelf: "flex-start", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {t.category}{t.subcategory ? ` \u203A ${t.subcategory}` : ""}
                        </span>
                      </div>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 500, textAlign: "right", whiteSpace: "nowrap", color: t.type === "income" ? PALETTE.income : PALETTE.expense }}>
                        {t.type === "income" ? "+" : "-"}{formatMoney(t.amount)}
                      </span>
                      <button className="del-btn" onClick={() => removeTransaction(t.id)} aria-label="Eliminar movimiento" style={{ background: "none", border: "none", cursor: "pointer", color: PALETTE.inkSoft, fontSize: 16, justifySelf: "end" }}>x</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "resumen" && (
          <>
            <section style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <select className="pill-btn" style={{ cursor: "pointer", background: PALETTE.paper }} value={resumenYear} onChange={(e) => setResumenYear(e.target.value)}>
                <option value="all">Todos los anos</option>
                {yearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </section>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 20 }}>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Ingresos</p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, color: PALETTE.income, margin: 0 }}>{formatMoney(resumenTotals.income)}</p>
              </div>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Gastos</p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, color: PALETTE.expense, margin: 0 }}>{formatMoney(resumenTotals.expense)}</p>
              </div>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Ahorro</p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, color: resumenTotals.savings >= 0 ? PALETTE.income : PALETTE.expense, margin: 0 }}>{formatMoney(resumenTotals.savings)}</p>
              </div>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Tasa de ahorro</p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, color: PALETTE.ink, margin: 0 }}>{resumenTotals.rate.toFixed(1)}%</p>
              </div>
            </section>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 12px" }}>Ingresos vs gastos {resumenYear === "all" ? "por ano" : "por mes"}</p>
              {resumenRows.every((r) => r.income === 0 && r.expense === 0) ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>No hay datos para este periodo todavia.</p>
              ) : (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={resumenRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Sans" }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={38} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatMoney(v)} />
                      <Bar dataKey="income" name="Ingresos" fill={PALETTE.income} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="expense" name="Gastos" fill={PALETTE.expense} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px" }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 12px" }}>Ahorro {resumenYear === "all" ? "por ano" : "por mes"}</p>
              {resumenRows.every((r) => r.income === 0 && r.expense === 0) ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>No hay datos para este periodo todavia.</p>
              ) : (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={resumenRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Sans" }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={38} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatMoney(v)} />
                      <Bar dataKey="savings" name="Ahorro" radius={[2, 2, 0, 0]}>
                        {resumenRows.map((r, i) => <Cell key={i} fill={r.savings >= 0 ? PALETTE.income : PALETTE.expense} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "categorias" && (
          <>
            <section style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <select className="pill-btn" style={{ cursor: "pointer", background: PALETTE.paper }} value={catYear} onChange={(e) => { setCatYear(e.target.value); setSubSelected(null); setSubExpanded(false); }}>
                <option value="all">Todos los anos</option>
                {yearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </section>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Gasto por categoria</p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: PALETTE.ink, margin: 0 }}>{formatMoney(catTotal)}</p>
              </div>
              {catBreakdown.length > 0 && (
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 16px", fontStyle: "italic" }}>Toca una categoria para ver su grafico de evolucion</p>
              )}
              {catBreakdown.length === 0 ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>No hay gastos registrados en este periodo.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {catBreakdown.map((c) => (
                    <div key={c.category} className={"cat-row" + (activeCatName === c.category ? " selected" : "")} onClick={() => { setCatSelected(c.category); setSubSelected(null); setSubExpanded(false); }} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="radio-dot" />
                      <span className="cat-name" style={{ fontSize: 13, width: 100, color: activeCatName === c.category ? PALETTE.cover : PALETTE.ink, background: activeCatName === c.category ? PALETTE.gold : "transparent", fontWeight: activeCatName === c.category ? 500 : 400, flexShrink: 0, padding: activeCatName === c.category ? "2px 6px" : "2px 0", borderRadius: 3, boxSizing: "border-box" }}>{c.category}</span>
                      <div style={{ flex: 1, height: 8, background: PALETTE.paperDim, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%`, height: "100%", background: activeCatName === c.category ? PALETTE.gold : PALETTE.expense }} />
                      </div>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, width: 40, textAlign: "right", color: PALETTE.inkSoft }}>{c.pct.toFixed(0)}%</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, width: 85, textAlign: "right", color: PALETTE.inkSoft }}>{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {activeCatName && (
              <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 12px" }}>Evolucion de {activeCatName.toLowerCase()} {catYear === "all" ? "por ano" : "por mes"}</p>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={catTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Sans" }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={38} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatMoney(v)} />
                      <Line type="monotone" dataKey="value" name="Importe" stroke={PALETTE.gold} strokeWidth={2} dot={{ r: 3, fill: PALETTE.gold }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {activeCatName && subBreakdown.length > 0 && (
              <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginTop: 20 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 4px" }}>
                  Desglose de {activeCatName.toLowerCase()} por subcategoria
                </p>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 16px", fontStyle: "italic" }}>Toca una subcategoria para ver su propio grafico</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {visibleSubBreakdown.map((s) => (
                    <div
                      key={s.subcategory}
                      className={"cat-row" + (subSelected === s.subcategory ? " selected" : "")}
                      onClick={() => setSubSelected(subSelected === s.subcategory ? null : s.subcategory)}
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <span className="radio-dot" />
                      <span className="cat-name" style={{ fontSize: 13, width: 140, color: subSelected === s.subcategory ? PALETTE.cover : PALETTE.ink, background: subSelected === s.subcategory ? PALETTE.gold : "transparent", fontWeight: subSelected === s.subcategory ? 500 : 400, flexShrink: 0, padding: subSelected === s.subcategory ? "2px 6px" : "2px 0", borderRadius: 3, boxSizing: "border-box" }}>{s.subcategory}</span>
                      <div style={{ flex: 1, height: 8, background: PALETTE.paperDim, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${maxSub ? (s.total / maxSub) * 100 : 0}%`, height: "100%", background: subSelected === s.subcategory ? PALETTE.gold : PALETTE.expense }} />
                      </div>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, width: 40, textAlign: "right", color: PALETTE.inkSoft }}>{s.pct.toFixed(0)}%</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, width: 85, textAlign: "right", color: PALETTE.inkSoft }}>{formatMoney(s.total)}</span>
                    </div>
                  ))}
                </div>
                {subBreakdown.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setSubExpanded((v) => !v)}
                    style={{ background: "none", border: "none", color: PALETTE.gold, fontSize: 13, cursor: "pointer", padding: 0, marginTop: 14 }}
                  >
                    {subExpanded ? "Ver menos" : `Ver mas (${subBreakdown.length - 5} mas)`}
                  </button>
                )}
              </section>
            )}

            {activeCatName && subSelected && (
              <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginTop: 20 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 12px" }}>
                  Evolucion de {subSelected.toLowerCase()} {catYear === "all" ? "por ano" : "por mes"}
                </p>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={subTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Sans" }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={38} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatMoney(v)} />
                      <Line type="monotone" dataKey="value" name="Importe" stroke={PALETTE.gold} strokeWidth={2} dot={{ r: 3, fill: PALETTE.gold }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "ajustes" && (
          <>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 16px" }}>Categorias de gasto</p>
              <div style={{ marginBottom: 14 }}>
                {catConfig.expense.map((c) => (
                  <span key={c} className="chip">
                    {c}{usageCount("expense", c) > 0 ? ` (${usageCount("expense", c)})` : ""}
                    <button className="chip-x" onClick={() => removeCategory("expense", c)} aria-label={`Eliminar ${c}`}>x</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="ledger-input" style={{ flex: 1 }} placeholder="Nueva categoria de gasto" value={newCatName.expense} onChange={(e) => setNewCatName({ ...newCatName, expense: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory("expense"); } }} />
                <button type="button" className="pill-btn" onClick={() => addCategory("expense")}>Anadir</button>
              </div>
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 16px" }}>Categorias de ingreso</p>
              <div style={{ marginBottom: 14 }}>
                {catConfig.income.map((c) => (
                  <span key={c} className="chip">
                    {c}{usageCount("income", c) > 0 ? ` (${usageCount("income", c)})` : ""}
                    <button className="chip-x" onClick={() => removeCategory("income", c)} aria-label={`Eliminar ${c}`}>x</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="ledger-input" style={{ flex: 1 }} placeholder="Nueva categoria de ingreso" value={newCatName.income} onChange={(e) => setNewCatName({ ...newCatName, income: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory("income"); } }} />
                <button type="button" className="pill-btn" onClick={() => addCategory("income")}>Anadir</button>
              </div>
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px" }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 16px" }}>Subcategorias</p>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Elige una categoria</label>
                <select className="ledger-select" value={subEditCategory} onChange={(e) => setSubEditCategory(e.target.value)}>
                  <option value="">Selecciona...</option>
                  {allCategoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {subEditCategory && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    {(subConfig[subEditCategory] || []).length === 0 ? (
                      <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Esta categoria aun no tiene subcategorias.</p>
                    ) : (
                      (subConfig[subEditCategory] || []).map((s) => (
                        <span key={s} className="chip">
                          {s}
                          <button className="chip-x" onClick={() => removeSubcategory(subEditCategory, s)} aria-label={`Eliminar ${s}`}>x</button>
                        </span>
                      ))
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="ledger-input" style={{ flex: 1 }} placeholder={`Nueva subcategoria de ${subEditCategory}`} value={newSubName} onChange={(e) => setNewSubName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubcategory(); } }} />
                    <button type="button" className="pill-btn" onClick={addSubcategory}>Anadir</button>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {storageError && (
          <p style={{ marginTop: 16, fontSize: 12, color: "rgba(242,244,245,0.78)" }}>No se pudo guardar en este momento. Tus datos de esta sesion siguen visibles, pero podrian no persistir.</p>
        )}
      </div>
    </div>
  );
}
