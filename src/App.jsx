import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { supabase } from "./supabaseClient";

// Clave gratuita de Twelve Data (precios de acciones, ETF y cripto) para la
// pestana Patrimonio. A diferencia de la clave de Supabase, esta no tiene
// una capa de seguridad tipo RLS detras: cualquiera que la vea en el codigo
// podria usarla y consumir parte de la cuota gratuita diaria (800/dia). Para
// un uso personal el riesgo es bajo; si algun dia se agota la cuota sin
// motivo, se puede regenerar la clave en twelvedata.com.
const TWELVE_DATA_KEY = "f246ef132582489ab829aa9047b61f25";

const LIGHT_PALETTE = {
  cover: "#F7F5F0",
  coverSoft: "#FFFFFF",
  paper: "#FFFFFF",
  paperDim: "#EFEBE2",
  ink: "#1B2333",
  inkSoft: "#6B7280",
  rule: "#E3DFD5",
  gold: "#219E82",
  income: "#1F8F76",
  incomeBg: "#E1F3EE",
  expense: "#DB5C77",
  expenseBg: "#FCEAEF",
};

const DARK_PALETTE = {
  cover: "#0E211C",
  coverSoft: "#132A23",
  paper: "#16302A",
  paperDim: "#1D3A32",
  ink: "#F5F7F5",
  inkSoft: "#9FB3AC",
  rule: "#274A40",
  gold: "#3FD6AE",
  income: "#3FD6AE",
  incomeBg: "#1B3A30",
  expense: "#F0899E",
  expenseBg: "#3A1F28",
};

const DEFAULT_CATEGORIES = {
  income: ["Nomina", "Intereses", "Hacienda", "Regalos", "Bizum", "Otros"],
  expense: ["Hogar", "Ocio", "Viajes", "Transporte", "Salud", "Otros"],
};

const DEFAULT_SUBCATEGORIES = {
  Hogar: ["Hipoteca", "Comunidad", "Factura Luz", "Factura Agua", "Factura Internet", "Factura Aerotermia", "Ibi", "Seguro", "Decoracion", "Mobiliario", "Electrodomesticos", "Alimentacion", "Varios"],
  Ocio: ["Bares / Cafeteria", "Restaurantes", "Alimentacion", "Cine_Teatro", "Compras", "Suscripciones", "Loterias"],
  Viajes: ["Alojamiento", "Gasolina", "Peajes", "Transporte", "Restaurantes", "Bares / Cafeteria", "Compras", "Actividades"],
  Transporte: ["Gasolina", "Parking", "Peajes", "Transporte Publico", "Itv", "Mantenimiento", "Limpieza", "Alimentacion"],
  Salud: ["Consulta", "Cosmetica", "Medicamentos", "Seguro"],
  Otros: ["Impuestos", "Moda", "Tecnologia", "Estudios", "Administrativos", "Regalos", "Varios"],
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
function groupThousands(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function formatMoney(n) {
  const v = Math.round(n * 100) / 100;
  const neg = v < 0;
  const parts = Math.abs(v).toFixed(2).split(".");
  return (neg ? "-" : "") + groupThousands(parts[0]) + "," + parts[1] + " \u20AC";
}
function formatMoneyRound(n) {
  const v = Math.round(n);
  const neg = v < 0;
  return (neg ? "-" : "") + groupThousands(Math.abs(v).toString()) + " \u20AC";
}
function formatMoneyShort(n) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Math.round(n)) + " EUR";
}
function niceTicks(minValue, maxValue, desiredCount = 5) {
  const lo = Math.min(0, minValue);
  const hi = Math.max(0, maxValue, 100);
  const range = hi - lo || 100;
  const rawStep = range / (desiredCount - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceResidual;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;
  const step = Math.max(100, niceResidual * magnitude);
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}
function formatMoneyAxis(n) {
  const v = Math.round(n);
  const neg = v < 0;
  return (neg ? "-" : "") + groupThousands(Math.abs(v).toString());
}
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return new Intl.NumberFormat("es-ES").format(d.getDate()) + " " + MONTHS[d.getMonth()].slice(0, 3);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function latestManualAssets(list) {
  const byName = {};
  list.forEach((a) => {
    const key = a.name.trim().toLowerCase();
    if (!byName[key] || a.date > byName[key].date) byName[key] = a;
  });
  return Object.values(byName);
}

function normUser(u) { return u.trim().toLowerCase(); }
function usernameToEmail(u) { return `${u}@myfunds.local`; }

const TABS = [
  { id: "registro", label: "Registro" },
  { id: "resumen", label: "Resumen" },
  { id: "categorias", label: "Detalle Gastos" },
  { id: "patrimonio", label: "Patrimonio" },
  { id: "evolucion", label: "Evolucion" },
];

function Mark({ size = 34 }) {
  const gid = "mfGrad";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#39C9A8" />
          <stop offset="100%" stopColor="#17836A" />
        </linearGradient>
      </defs>
      <path d="M11 8 H30 L21 17 H11 Z" fill={`url(#${gid})`} />
      <path d="M11 19 H24 L17 26 H11 Z" fill="#17836A" />
      <rect x="11" y="8" width="4.2" height="24" rx="2.1" fill="#17836A" />
    </svg>
  );
}

function Wordmark({ size = 26, color }) {
  return (
    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: size, color, display: "inline-flex" }}>
      <span style={{ fontWeight: 500 }}>my</span>
      <span style={{ fontWeight: 800 }}>Funds</span>
    </span>
  );
}

function EyeIcon({ open, size = 16, color }) {
  return open ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 12 C 4 6, 9 3, 12 3 C 15 3, 20 6, 23 12 C 20 18, 15 21, 12 21 C 9 21, 4 18, 1 12 Z" stroke={color} strokeWidth="1.6" fill="none" />
      <circle cx="12" cy="12" r="3.4" stroke={color} strokeWidth="1.6" fill="none" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1 12 C 4 6, 9 3, 12 3 C 15 3, 20 6, 23 12 C 20 18, 15 21, 12 21 C 9 21, 4 18, 1 12 Z" stroke={color} strokeWidth="1.6" fill="none" />
      <circle cx="12" cy="12" r="3.4" stroke={color} strokeWidth="1.6" fill="none" />
      <line x1="3" y1="21" x2="21" y2="3" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState("light");
  const PALETTE = mode === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const FONT = mode === "dark" ? "'Satoshi', 'Manrope', sans-serif" : "'Manrope', sans-serif";

  const [authLoaded, setAuthLoaded] = useState(false);
  const [session, setSession] = useState(null);
  const currentUser = session?.user?.user_metadata?.username || null;
  const userId = session?.user?.id || null;
  const [authMode, setAuthMode] = useState("login");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginPass2, setLoginPass2] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [catConfig, setCatConfig] = useState(DEFAULT_CATEGORIES);
  const [subConfig, setSubConfig] = useState(DEFAULT_SUBCATEGORIES);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState("registro");

  // ---------- Patrimonio ----------
  const [manualAssets, setManualAssets] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [netWorthHistory, setNetWorthHistory] = useState([]);
  const [priceMap, setPriceMap] = useState({});
  const [openPriceEur, setOpenPriceEur] = useState({});
  const [netWorthLoaded, setNetWorthLoaded] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [netWorthError, setNetWorthError] = useState("");
  const [historicalError, setHistoricalError] = useState("");
  const [addAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [assetForm, setAssetForm] = useState({ name: "", value: "", date: todayISO(), category: "Cuenta Corriente" });
  const [addHoldingModalOpen, setAddHoldingModalOpen] = useState(false);
  const [holdingView, setHoldingView] = useState("acumulado");
  const [editingHoldingId, setEditingHoldingId] = useState(null);
  const [realizedGains, setRealizedGains] = useState([]);
  const [closeModalHolding, setCloseModalHolding] = useState(null);
  const [closeForm, setCloseForm] = useState({ gain: "", closeDate: todayISO(), notes: "" });
  const [patrimonioView, setPatrimonioView] = useState("detalle");
  const [openPositionsExpanded, setOpenPositionsExpanded] = useState(true);
  const [closedPositionsExpanded, setClosedPositionsExpanded] = useState(false);
  const [historicalPnL, setHistoricalPnL] = useState({});
  const [historicalValue, setHistoricalValue] = useState({});
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalLoaded, setHistoricalLoaded] = useState(false);
  const [holdingForm, setHoldingForm] = useState({ symbol: "", quantity: "", kind: "stock", openPrice: "", openDate: todayISO(), commission: "", finnhubSymbol: "" });
  const [symbolResults, setSymbolResults] = useState([]);
  const [finnhubResults, setFinnhubResults] = useState([]);
  const [finnhubSearching, setFinnhubSearching] = useState(false);
  const [finnhubPickedName, setFinnhubPickedName] = useState("");
  const [symbolSearching, setSymbolSearching] = useState(false);
  const [symbolPickedName, setSymbolPickedName] = useState("");
  const [expandedSymbols, setExpandedSymbols] = useState({});
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
  const [catEditType, setCatEditType] = useState("expense");
  const [addCatModalOpen, setAddCatModalOpen] = useState(false);
  const [addSubModalOpen, setAddSubModalOpen] = useState(false);
  const [subEditCategory, setSubEditCategory] = useState("");
  const [newSubName, setNewSubName] = useState("");

  const [reassignFrom, setReassignFrom] = useState({ income: "", expense: "" });
  const [reassignTo, setReassignTo] = useState({ income: "", expense: "" });
  const [reassignMsg, setReassignMsg] = useState({ income: "", expense: "" });
  const [subReassignFrom, setSubReassignFrom] = useState("");
  const [subReassignTo, setSubReassignTo] = useState("");
  const [subReassignMsg, setSubReassignMsg] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("myfunds_theme_pref");
      if (saved === "light" || saved === "dark") setMode(saved);
    } catch (e) {
      // no preference saved yet
    }
  }, []);

  async function toggleMode() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    if (userId) {
      try { await supabase.from("user_settings").update({ theme: next }).eq("user_id", userId); } catch (e) { /* ignore */ }
    } else {
      try { localStorage.setItem("myfunds_theme_pref", next); } catch (e) { /* ignore */ }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoaded(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser || !userId) return;
    (async () => {
      setDataLoaded(false);
      setLoadError(false);
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .order("date", { ascending: false });
        if (error) throw error;
        setTransactions((data || []).map((r) => ({
          id: r.id,
          type: r.type,
          amount: Number(r.amount),
          description: r.description,
          category: r.category,
          subcategory: r.subcategory || "",
          date: r.date,
        })));
      } catch (e) {
        // No tocamos "transactions": si ya habia datos cargados de antes,
        // los dejamos como estan en vez de vaciarlos. Un fallo de lectura
        // no debe parecer una perdida de datos.
        console.error("Error cargando movimientos:", e);
        setLoadError(true);
      }
      try {
        const { data, error } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setCatConfig(data.categories || DEFAULT_CATEGORIES);
          setSubConfig(data.subcategories || {});
          if (data.theme === "light" || data.theme === "dark") setMode(data.theme);
        } else {
          setCatConfig(DEFAULT_CATEGORIES);
          setSubConfig(DEFAULT_SUBCATEGORIES);
          await supabase.from("user_settings").insert({
            user_id: userId, categories: DEFAULT_CATEGORIES, subcategories: DEFAULT_SUBCATEGORIES, theme: mode,
          });
        }
      } catch (e) {
        setCatConfig(DEFAULT_CATEGORIES);
        setSubConfig(DEFAULT_SUBCATEGORIES);
      } finally {
        setDataLoaded(true);
      }
    })();
  }, [currentUser, userId]);

  useEffect(() => {
    if (catConfig.expense && catConfig.expense.length && !catConfig.expense.includes(category) && !catConfig.income.includes(category)) {
      setCategory(catConfig[type][0] || "");
    }
  }, [catConfig]);

  useEffect(() => {
    const nextCat = (catConfig[type] && catConfig[type][0]) || "";
    setCategory(nextCat);
    const sorted = (subConfig[nextCat] || []).slice().sort((a, b) => a.localeCompare(b, "es"));
    setSubcategory(sorted[0] || "");
  }, [type, catConfig]);

  useEffect(() => {
    if (!dataLoaded || transactions.length === 0) return;
    const nextCats = { income: [...catConfig.income], expense: [...catConfig.expense] };
    const nextSubs = { ...subConfig };
    let changed = false;
    transactions.forEach((t) => {
      const kind = t.type === "income" ? "income" : "expense";
      if (t.category && !nextCats[kind].includes(t.category)) {
        nextCats[kind] = [...nextCats[kind], t.category];
        changed = true;
      }
      const subKey = t.subcategory && t.subcategory.trim();
      if (t.category && subKey) {
        const existing = nextSubs[t.category] || [];
        if (!existing.includes(subKey)) {
          nextSubs[t.category] = [...existing, subKey];
          changed = true;
        }
      }
    });
    if (changed) persistCategories(nextCats, nextSubs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoaded, transactions]);

  const [lastSaveError, setLastSaveError] = useState("");

  async function persistTransactions(next, allowBulkDelete = false) {
    const prevById = new Map(transactions.map((t) => [t.id, t]));
    const nextIds = new Set(next.map((t) => t.id));
    const toInsert = next.filter((t) => !prevById.has(t.id));
    const toDelete = transactions.filter((t) => !nextIds.has(t.id));
    const toUpdate = next.filter((t) => {
      const old = prevById.get(t.id);
      if (!old) return false;
      return old.type !== t.type || old.amount !== t.amount || old.description !== t.description
        || old.category !== t.category || (old.subcategory || "") !== (t.subcategory || "") || old.date !== t.date;
    });

    // Seguridad: ninguna operacion normal de la app borra mas de un
    // movimiento a la vez. Si en algun momento se calculan mas borrados
    // que eso, algo va mal (datos locales desincronizados) y es mas
    // seguro negarse a guardar que arriesgarse a perder movimientos.
    if (toDelete.length > 1 && !allowBulkDelete) {
      setStorageError(true);
      return { ok: false, error: "Bloqueado por seguridad: se iban a borrar varios movimientos a la vez." };
    }

    // Importante: NO actualizamos la pantalla todavia. Primero
    // confirmamos que Supabase ha guardado los cambios de verdad; solo
    // si todo sale bien reflejamos "next" en la interfaz. Así la
    // pantalla nunca muestra datos que en realidad no se han guardado.
    try {
      if (toInsert.length) {
        const rows = toInsert.map((t) => ({
          id: t.id, user_id: userId, type: t.type, amount: t.amount,
          description: t.description, category: t.category, subcategory: t.subcategory || "", date: t.date,
        }));
        // Insertamos en bloques pequenos para no toparnos con limites de
        // tamano/filas por peticion cuando se importan muchos a la vez.
        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const { error } = await supabase.from("transactions").insert(chunk);
          if (error) throw error;
        }
      }
      if (toUpdate.length) {
        const results = await Promise.all(toUpdate.map((t) =>
          supabase.from("transactions").update({
            type: t.type, amount: t.amount, description: t.description,
            category: t.category, subcategory: t.subcategory || "", date: t.date,
          }).eq("id", t.id)
        ));
        const failed = results.find((r) => r.error);
        if (failed) throw failed.error;
      }
      if (toDelete.length) {
        const { error } = await supabase.from("transactions").delete().in("id", toDelete.map((t) => t.id));
        if (error) throw error;
      }
      setTransactions(next);
      setStorageError(false);
      return { ok: true };
    } catch (e) {
      console.error("Error guardando movimientos:", e);
      const msg = (e && (e.message || e.details || e.hint)) || JSON.stringify(e);
      setLastSaveError(msg);
      setStorageError(true);
      return { ok: false, error: msg };
    }
  }
  async function persistCategories(nextCats, nextSubs) {
    setCatConfig(nextCats);
    setSubConfig(nextSubs);
    try {
      const { error } = await supabase.from("user_settings").upsert({
        user_id: userId, categories: nextCats, subcategories: nextSubs, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setStorageError(false);
    } catch (e) {
      setStorageError(true);
    }
  }

  // ---------- Patrimonio: carga, precios, y mutaciones ----------
  async function loadNetWorthData() {
    try {
      const [assetsRes, holdingsRes, historyRes, realizedRes] = await Promise.all([
        supabase.from("manual_assets").select("*").order("name"),
        supabase.from("holdings").select("*").order("symbol"),
        supabase.from("networth_snapshots").select("*").order("date", { ascending: true }),
        supabase.from("realized_gains").select("*").order("close_date", { ascending: true }),
      ]);
      if (assetsRes.error) throw assetsRes.error;
      if (holdingsRes.error) throw holdingsRes.error;
      if (historyRes.error) throw historyRes.error;
      if (realizedRes.error) throw realizedRes.error;
      setManualAssets((assetsRes.data || []).map((r) => ({ id: r.id, name: r.name, value: Number(r.value), date: r.date, category: r.category || "Cuenta Corriente" })));
      setHoldings((holdingsRes.data || []).map((r) => ({
        id: r.id, symbol: r.symbol, quantity: Number(r.quantity), kind: r.kind,
        openPrice: r.open_price != null ? Number(r.open_price) : null,
        openDate: r.open_date || null,
        commission: r.commission != null ? Number(r.commission) : 0,
        finnhubSymbol: r.finnhub_symbol || "",
      })));
      setNetWorthHistory((historyRes.data || []).map((r) => ({ date: r.date, total: Number(r.total) })));
      setRealizedGains((realizedRes.data || []).map((r) => ({
        id: r.id, symbol: r.symbol, kind: r.kind, quantity: Number(r.quantity),
        openPrice: r.open_price != null ? Number(r.open_price) : null,
        openDate: r.open_date || null, closeDate: r.close_date,
        commission: Number(r.commission || 0), gain: Number(r.gain), notes: r.notes || "",
      })));
      setNetWorthError("");
    } catch (e) {
      console.error("Error cargando patrimonio:", e);
      setNetWorthError(e.message || "No se pudieron cargar los datos de patrimonio.");
    } finally {
      setNetWorthLoaded(true);
    }
  }

  async function searchSymbols(query) {
    if (!query || query.trim().length < 2) return [];
    try {
      const res = await fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query.trim())}&outputsize=8&apikey=${TWELVE_DATA_KEY}`);
      const data = await res.json();
      return data.data || [];
    } catch (e) {
      console.error("Error buscando simbolos:", e);
      return [];
    }
  }

  function kindFromInstrumentType(type) {
    const t = (type || "").toLowerCase();
    if (t.includes("crypto") || t.includes("digital currency")) return "crypto";
    if (t.includes("etf") || t.includes("fund")) return "etf";
    return "stock";
  }

  useEffect(() => {
    if (!addHoldingModalOpen) { setSymbolResults([]); return; }
    const query = holdingForm.symbol;
    if (!query || query.trim().length < 2 || query.trim() === symbolPickedName) { setSymbolResults([]); return; }
    const timer = setTimeout(async () => {
      setSymbolSearching(true);
      const results = await searchSymbols(query);
      setSymbolResults(results);
      setSymbolSearching(false);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingForm.symbol, addHoldingModalOpen]);

  function pickSymbolResult(r) {
    setHoldingForm({ ...holdingForm, symbol: r.symbol, kind: kindFromInstrumentType(r.instrument_type) });
    setSymbolPickedName(r.symbol);
    setSymbolResults([]);
  }

  async function searchFinnhubSymbols(query) {
    if (!query || query.trim().length < 2) return [];
    try {
      const target = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query.trim())}&quotesCount=8&newsCount=0`;
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
      const data = await res.json();
      return (data.quotes || []).filter((q) => q.symbol).slice(0, 8);
    } catch (e) {
      console.error("Error buscando en Yahoo Finance:", e);
      return [];
    }
  }

  useEffect(() => {
    if (!addHoldingModalOpen) { setFinnhubResults([]); return; }
    const query = holdingForm.finnhubSymbol;
    if (!query || query.trim().length < 2 || query.trim() === finnhubPickedName) { setFinnhubResults([]); return; }
    const timer = setTimeout(async () => {
      setFinnhubSearching(true);
      const results = await searchFinnhubSymbols(query);
      setFinnhubResults(results);
      setFinnhubSearching(false);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingForm.finnhubSymbol, addHoldingModalOpen]);

  function pickFinnhubResult(r) {
    const baseTicker = r.symbol.split(".")[0];
    setHoldingForm({
      ...holdingForm,
      finnhubSymbol: r.symbol,
      symbol: holdingForm.symbol.trim() ? holdingForm.symbol : baseTicker,
    });
    setFinnhubPickedName(r.symbol);
    setFinnhubResults([]);
  }

  async function fetchExchangeRates(currencies) {
    if (currencies.length === 0) return {};
    try {
      const pairs = currencies.map((c) => `${c}/EUR`);
      const res = await fetch(`https://api.twelvedata.com/exchange_rate?symbol=${encodeURIComponent(pairs.join(","))}&apikey=${TWELVE_DATA_KEY}`);
      const data = await res.json();
      const rates = {};
      if (pairs.length === 1) {
        const r = parseFloat(data.rate);
        if (!isNaN(r)) rates[currencies[0]] = r;
      } else {
        pairs.forEach((p, i) => {
          const entry = data[p];
          const r = entry && parseFloat(entry.rate);
          if (!isNaN(r)) rates[currencies[i]] = r;
        });
      }
      return rates;
    } catch (e) {
      console.error("Error obteniendo tipos de cambio:", e);
      return {};
    }
  }

  async function fetchPrices(symbols) {
    if (symbols.length === 0) return {};
    try {
      const res = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(","))}&apikey=${TWELVE_DATA_KEY}`);
      const data = await res.json();
      const map = {};
      const errors = [];
      const parseEntry = (entry, symbolForError) => {
        if (!entry) return null;
        if (entry.status === "error" || entry.code) {
          errors.push(`${symbolForError}: ${entry.message || "error desconocido"}`);
          return null;
        }
        const price = parseFloat(entry.close);
        if (isNaN(price)) return null;
        const dayChange = parseFloat(entry.change);
        const dayPercentChange = parseFloat(entry.percent_change);
        return {
          price,
          dayChange: isNaN(dayChange) ? null : dayChange,
          dayPercentChange: isNaN(dayPercentChange) ? null : dayPercentChange,
          currency: (entry.currency || "").toUpperCase() || null,
        };
      };
      if (symbols.length === 1) {
        const parsed = parseEntry(data, symbols[0]);
        if (parsed) map[symbols[0]] = parsed;
      } else {
        symbols.forEach((s) => {
          const parsed = parseEntry(data[s], s);
          if (parsed) map[s] = parsed;
        });
      }
      if (errors.length > 0) {
        setNetWorthError(`Twelve Data: ${errors.join(" · ")}`);
      }

      // Los precios llegan en la divisa nativa del instrumento (ej. USD
      // para acciones de EEUU). Los convertimos todos a EUR para que el
      // total y las ganancias sean correctos.
      const foreignCurrencies = [...new Set(Object.values(map).map((q) => q.currency).filter((c) => c && c !== "EUR"))];
      if (foreignCurrencies.length > 0) {
        const rates = await fetchExchangeRates(foreignCurrencies);
        Object.values(map).forEach((q) => {
          if (q.currency && q.currency !== "EUR" && rates[q.currency]) {
            q.price = q.price * rates[q.currency];
            if (q.dayChange != null) q.dayChange = q.dayChange * rates[q.currency];
          }
        });
      }

      return map;
    } catch (e) {
      console.error("Error obteniendo precios:", e);
      setNetWorthError(`Fallo de red pidiendo precios a Twelve Data: ${e.message}`);
      return {};
    }
  }

  async function fetchHistoricalRate(currency, date) {
    try {
      const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${currency}/EUR&interval=1day&start_date=${date}&end_date=${date}&apikey=${TWELVE_DATA_KEY}`);
      const data = await res.json();
      const v = data.values && data.values[0] && parseFloat(data.values[0].close);
      if (!isNaN(v)) return v;
      // Fin de semana / festivo sin cotizacion forex: probamos un rango de
      // unos dias hacia atras y nos quedamos con el mas reciente.
      const d = new Date(date + "T00:00:00");
      d.setDate(d.getDate() - 5);
      const start = d.toISOString().slice(0, 10);
      const res2 = await fetch(`https://api.twelvedata.com/time_series?symbol=${currency}/EUR&interval=1day&start_date=${start}&end_date=${date}&apikey=${TWELVE_DATA_KEY}`);
      const data2 = await res2.json();
      const v2 = data2.values && data2.values[0] && parseFloat(data2.values[0].close);
      return isNaN(v2) ? null : v2;
    } catch (e) {
      console.error("Error obteniendo cambio historico:", e);
      return null;
    }
  }

  async function fetchMonthlySeries(symbol, startDate) {
    try {
      const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1month&start_date=${startDate}&end_date=${todayISO()}&outputsize=500&apikey=${TWELVE_DATA_KEY}`);
      const data = await res.json();
      if (!data.values) {
        if (data.status === "error" || data.code) {
          setHistoricalError(`Twelve Data (${symbol}): ${data.message || "error desconocido al pedir historico"}`);
        }
        return [];
      }
      return data.values
        .map((v) => ({ month: v.datetime.slice(0, 7), close: parseFloat(v.close) }))
        .filter((v) => !isNaN(v.close));
    } catch (e) {
      console.error("Error obteniendo historico mensual:", e);
      setHistoricalError(`Fallo de red pidiendo historico de ${symbol}: ${e.message}`);
      return [];
    }
  }

  async function computeHistoricalPnL(currentHoldings) {
    const withOpen = currentHoldings.filter((h) => h.openPrice != null && !isNaN(h.openPrice) && h.openDate);
    if (withOpen.length === 0) return { gainByMonth: {}, valueByMonth: {} };
    const monthlyGain = {};
    const monthlyValue = {};
    const fxSeriesCache = {};
    for (const h of withOpen) {
      const openEur = openPriceEur[h.id]; // puede ser null si fallo el cambio historico; aun asi calculamos el VALOR
      const priceSeries = await fetchMonthlySeries(h.symbol, h.openDate);
      if (priceSeries.length === 0) continue;
      const currency = priceMap[h.symbol] && priceMap[h.symbol].currency;
      let fxByMonth = null;
      if (currency && currency !== "EUR") {
        if (!(currency in fxSeriesCache)) {
          const fxSeries = await fetchMonthlySeries(`${currency}/EUR`, h.openDate);
          const map = {};
          fxSeries.forEach((v) => { map[v.month] = v.close; });
          fxSeriesCache[currency] = map;
        }
        fxByMonth = fxSeriesCache[currency];
      }
      const openMonth = h.openDate.slice(0, 7);
      priceSeries.forEach(({ month, close }) => {
        if (month < openMonth) return;
        let priceEur = close;
        if (fxByMonth) {
          const rate = fxByMonth[month] || Object.values(fxByMonth)[0];
          if (rate) priceEur = close * rate;
        }
        monthlyValue[month] = (monthlyValue[month] || 0) + priceEur * h.quantity;
        if (openEur != null) {
          const gain = (priceEur - openEur) * h.quantity;
          monthlyGain[month] = (monthlyGain[month] || 0) + gain;
        }
      });
    }
    return { gainByMonth: monthlyGain, valueByMonth: monthlyValue };
  }

  async function fetchYahooQuote(yahooSymbol) {
    try {
      const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`;
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`);
      const data = await res.json();
      const result = data && data.chart && data.chart.result && data.chart.result[0];
      if (!result || !result.meta || result.meta.regularMarketPrice == null) {
        setNetWorthError(`Yahoo Finance tampoco encontro precio para "${yahooSymbol}". Prueba otro formato de simbolo (ej. con o sin sufijo de pais) o pasa este a activo manual.`);
        return null;
      }
      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose != null ? meta.previousClose : meta.chartPreviousClose;
      const dayChange = prevClose != null ? price - prevClose : null;
      const dayPercentChange = prevClose ? (dayChange / prevClose) * 100 : null;
      return {
        price,
        dayChange,
        dayPercentChange,
        currency: (meta.currency || "EUR").toUpperCase(),
      };
    } catch (e) {
      console.error("Error obteniendo precio de Yahoo Finance:", e);
      setNetWorthError(`Fallo pidiendo precio a Yahoo Finance para "${yahooSymbol}": ${e.message}`);
      return null;
    }
  }

  async function refreshNetWorth(currentHoldings, currentAssets) {
    setPricesLoading(true);
    setNetWorthError("");
    try {
      // Si el usuario ha puesto un simbolo alternativo (Yahoo Finance) para
      // una posicion, es una senal explicita de que Twelve Data no sirve
      // para ese valor — ni lo intentamos ahi, para evitar que un ticker
      // ambiguo (ej. "IUSN" sin bolsa) traiga por error el precio de OTRO
      // instrumento distinto que casualmente se llama igual.
      const symbolsWithFinnhubOverride = new Set(
        currentHoldings.filter((h) => h.finnhubSymbol).map((h) => h.symbol)
      );
      const symbols = [...new Set(currentHoldings.map((h) => h.symbol))];
      const symbolsForTwelveData = symbols.filter((s) => !symbolsWithFinnhubOverride.has(s));
      const prices = await fetchPrices(symbolsForTwelveData);

      // Para los simbolos con respaldo (o los que Twelve Data no pudo dar),
      // probamos Yahoo Finance con el mismo simbolo.
      const symbolsNeedingFallback = symbols.filter((s) => !prices[s]);
      for (const s of symbolsNeedingFallback) {
        const holdingWithFallback = currentHoldings.find((h) => h.symbol === s && h.finnhubSymbol);
        if (!holdingWithFallback) continue;
        const altSymbol = holdingWithFallback.finnhubSymbol;
        const yahooPrice = await fetchYahooQuote(altSymbol);
        if (yahooPrice) prices[s] = yahooPrice;
      }

      setPriceMap(prices);

      // Convertimos el precio de apertura de cada posicion a EUR usando el
      // tipo de cambio del dia en que se abrio (no el de hoy), para que la
      // ganancia/perdida coincida con lo que calcula tu broker.
      const rateCache = {};
      const openEur = {};
      for (const h of currentHoldings) {
        if (h.openPrice == null || isNaN(h.openPrice)) continue;
        const currency = prices[h.symbol] && prices[h.symbol].currency;
        if (!currency || currency === "EUR" || !h.openDate) {
          openEur[h.id] = h.openPrice;
          continue;
        }
        const cacheKey = `${currency}_${h.openDate}`;
        if (!(cacheKey in rateCache)) {
          rateCache[cacheKey] = await fetchHistoricalRate(currency, h.openDate);
        }
        const rate = rateCache[cacheKey];
        openEur[h.id] = rate != null ? h.openPrice * rate : null;
      }
      setOpenPriceEur(openEur);

      const holdingsTotal = currentHoldings.reduce((sum, h) => sum + (prices[h.symbol] ? prices[h.symbol].price : 0) * h.quantity, 0);
      const manualTotal = latestManualAssets(currentAssets).reduce((sum, a) => sum + a.value, 0);
      const total = holdingsTotal + manualTotal;
      const today = todayISO();
      const { error } = await supabase.from("networth_snapshots").upsert({
        id: `${userId}_${today}`, user_id: userId, date: today,
        total, manual_total: manualTotal, holdings_total: holdingsTotal,
      }, { onConflict: "user_id,date" });
      if (error) throw error;
      setNetWorthHistory((prev) => {
        const withoutToday = prev.filter((r) => r.date !== today);
        return [...withoutToday, { date: today, total }].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
    } catch (e) {
      console.error("Error actualizando patrimonio:", e);
      setNetWorthError(e.message || "No se pudo actualizar el patrimonio.");
    } finally {
      setPricesLoading(false);
    }
  }

  async function addManualAsset() {
    const value = parseFloat(String(assetForm.value).replace(",", "."));
    if (!assetForm.name.trim() || isNaN(value)) return;
    const asset = { id: uid(), name: assetForm.name.trim(), value, date: assetForm.date || todayISO(), category: assetForm.category || "Cuenta Corriente" };
    try {
      const { error } = await supabase.from("manual_assets").insert({ id: asset.id, user_id: userId, name: asset.name, value: asset.value, date: asset.date, category: asset.category });
      if (error) throw error;
      const nextAssets = [...manualAssets, asset];
      setManualAssets(nextAssets);
      setAssetForm({ name: "", value: "", date: todayISO(), category: "Cuenta Corriente" });
      setAddAssetModalOpen(false);
      refreshNetWorth(holdings, nextAssets);
    } catch (e) {
      setNetWorthError(e.message || "No se pudo anadir el activo.");
    }
  }

  async function removeManualAsset(name) {
    try {
      const key = name.trim().toLowerCase();
      const idsToDelete = manualAssets.filter((a) => a.name.trim().toLowerCase() === key).map((a) => a.id);
      const { error } = await supabase.from("manual_assets").delete().in("id", idsToDelete);
      if (error) throw error;
      const nextAssets = manualAssets.filter((a) => !idsToDelete.includes(a.id));
      setManualAssets(nextAssets);
      refreshNetWorth(holdings, nextAssets);
    } catch (e) {
      setNetWorthError(e.message || "No se pudo borrar el activo.");
    }
  }

  async function saveHolding() {
    const quantity = parseFloat(String(holdingForm.quantity).replace(",", "."));
    const symbol = holdingForm.symbol.trim().toUpperCase();
    if (!symbol) { setNetWorthError("Falta el simbolo."); return; }
    if (isNaN(quantity) || quantity <= 0) { setNetWorthError("La cantidad debe ser un numero mayor que cero."); return; }
    setNetWorthError("");
    const openPriceVal = holdingForm.openPrice === "" ? null : parseFloat(String(holdingForm.openPrice).replace(",", "."));
    const commissionVal = holdingForm.commission === "" ? 0 : parseFloat(String(holdingForm.commission).replace(",", "."));
    const payload = {
      symbol, quantity, kind: holdingForm.kind,
      openPrice: isNaN(openPriceVal) ? null : openPriceVal,
      openDate: holdingForm.openDate || null,
      commission: isNaN(commissionVal) ? 0 : commissionVal,
      finnhubSymbol: holdingForm.finnhubSymbol.trim() || "",
    };
    try {
      if (editingHoldingId) {
        const { error } = await supabase.from("holdings").update({
          symbol: payload.symbol, quantity: payload.quantity, kind: payload.kind,
          open_price: payload.openPrice, open_date: payload.openDate, commission: payload.commission,
          finnhub_symbol: payload.finnhubSymbol || null,
        }).eq("id", editingHoldingId);
        if (error) throw error;
        const nextHoldings = holdings.map((h) => (h.id === editingHoldingId ? { id: editingHoldingId, ...payload } : h));
        setHoldings(nextHoldings);
        refreshNetWorth(nextHoldings, manualAssets);
      setHistoricalLoaded(false);
      } else {
        const holding = { id: uid(), ...payload };
        const { error } = await supabase.from("holdings").insert({
          id: holding.id, user_id: userId, symbol: holding.symbol, quantity: holding.quantity, kind: holding.kind,
          open_price: holding.openPrice, open_date: holding.openDate, commission: holding.commission,
          finnhub_symbol: holding.finnhubSymbol || null,
        });
        if (error) throw error;
        const nextHoldings = [...holdings, holding];
        setHoldings(nextHoldings);
        refreshNetWorth(nextHoldings, manualAssets);
      setHistoricalLoaded(false);
      }
      setHoldingForm({ symbol: "", quantity: "", kind: "stock", openPrice: "", openDate: todayISO(), commission: "", finnhubSymbol: "" });
      setEditingHoldingId(null);
      setAddHoldingModalOpen(false);
    } catch (e) {
      setNetWorthError(e.message || "No se pudo guardar la posicion. Revisa que el simbolo sea correcto (ej. AAPL, BTC/USD).");
    }
  }

  function startEditHolding(h) {
    setEditingHoldingId(h.id);
    setHoldingForm({
      symbol: h.symbol,
      quantity: String(h.quantity),
      kind: h.kind,
      openPrice: h.openPrice != null ? String(h.openPrice) : "",
      openDate: h.openDate || todayISO(),
      commission: h.commission ? String(h.commission) : "",
      finnhubSymbol: h.finnhubSymbol || "",
    });
    setSymbolPickedName(h.symbol);
    setSymbolResults([]);
    setFinnhubPickedName(h.finnhubSymbol || "");
    setFinnhubResults([]);
    setAddHoldingModalOpen(true);
  }

  async function removeHolding(id) {
    try {
      const { error } = await supabase.from("holdings").delete().eq("id", id);
      if (error) throw error;
      const nextHoldings = holdings.filter((h) => h.id !== id);
      setHoldings(nextHoldings);
      refreshNetWorth(nextHoldings, manualAssets);
      setHistoricalLoaded(false);
    } catch (e) {
      setNetWorthError(e.message || "No se pudo borrar la posicion.");
    }
  }

  function startClosePosition(h) {
    const quote = priceMap[h.symbol];
    const price = quote ? quote.price : null;
    const openEur = openPriceEur[h.id];
    const suggested = openEur != null && price != null ? (price - openEur) * h.quantity - (h.commission || 0) : 0;
    setCloseForm({ gain: suggested.toFixed(2), closeDate: todayISO(), notes: "" });
    setCloseModalHolding(h);
  }

  async function confirmClosePosition() {
    if (!closeModalHolding) return;
    const h = closeModalHolding;
    const gain = parseFloat(String(closeForm.gain).replace(",", "."));
    if (isNaN(gain)) return;
    const record = {
      id: uid(), symbol: h.symbol, kind: h.kind, quantity: h.quantity,
      openPrice: h.openPrice, openDate: h.openDate,
      closeDate: closeForm.closeDate || todayISO(),
      commission: h.commission || 0, gain,
      notes: closeForm.notes.trim(),
    };
    try {
      const { error: insError } = await supabase.from("realized_gains").insert({
        id: record.id, user_id: userId, symbol: record.symbol, kind: record.kind, quantity: record.quantity,
        open_price: record.openPrice, open_date: record.openDate, close_date: record.closeDate,
        commission: record.commission, gain: record.gain, notes: record.notes,
      });
      if (insError) throw insError;
      const { error: delError } = await supabase.from("holdings").delete().eq("id", h.id);
      if (delError) throw delError;
      setRealizedGains((prev) => [...prev, record].sort((a, b) => (a.closeDate < b.closeDate ? -1 : 1)));
      const nextHoldings = holdings.filter((x) => x.id !== h.id);
      setHoldings(nextHoldings);
      setCloseModalHolding(null);
      refreshNetWorth(nextHoldings, manualAssets);
      setHistoricalLoaded(false);
    } catch (e) {
      setNetWorthError(e.message || "No se pudo cerrar la posicion.");
    }
  }

  useEffect(() => {
    if ((activeTab !== "patrimonio" && activeTab !== "evolucion") || !userId || netWorthLoaded) return;
    (async () => {
      await loadNetWorthData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userId]);

  useEffect(() => {
    if (!netWorthLoaded) return;
    refreshNetWorth(holdings, manualAssets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netWorthLoaded]);

  async function loadHistoricalPnL() {
    setHistoricalLoading(true);
    setHistoricalError("");
    try {
      const { gainByMonth, valueByMonth } = await computeHistoricalPnL(holdings);
      setHistoricalPnL(gainByMonth);
      setHistoricalValue(valueByMonth);
    } catch (e) {
      console.error("Error reconstruyendo historico:", e);
    } finally {
      setHistoricalLoading(false);
      setHistoricalLoaded(true);
    }
  }

  useEffect(() => {
    if (activeTab !== "evolucion" || !netWorthLoaded || pricesLoading || historicalLoaded || historicalLoading) return;
    loadHistoricalPnL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, netWorthLoaded, pricesLoading]);

  const visibleManualAssets = useMemo(() => latestManualAssets(manualAssets).sort((a, b) => a.name.localeCompare(b.name, "es")), [manualAssets]);
  const manualTotal = visibleManualAssets.reduce((sum, a) => sum + a.value, 0);
  const holdingsTotal = holdings.reduce((sum, h) => sum + (priceMap[h.symbol] ? priceMap[h.symbol].price : 0) * h.quantity, 0);
  const holdingsWithGain = holdings.filter((h) => openPriceEur[h.id] != null && priceMap[h.symbol] != null);
  const totalGain = holdingsWithGain.reduce((sum, h) => sum + (priceMap[h.symbol].price - openPriceEur[h.id]) * h.quantity - (h.commission || 0), 0);
  const totalDayChange = holdings.reduce((sum, h) => {
    const q = priceMap[h.symbol];
    return sum + (q && q.dayChange != null ? q.dayChange * h.quantity : 0);
  }, 0);
  const netWorthTotal = manualTotal + holdingsTotal;
  const netWorthTicks = niceTicks(0, netWorthHistory.reduce((m, r) => Math.max(m, r.total), 0), 6);

  const groupedHoldings = useMemo(() => {
    const map = {};
    holdings.forEach((h) => {
      if (!map[h.symbol]) map[h.symbol] = [];
      map[h.symbol].push(h);
    });
    return Object.entries(map)
      .map(([symbol, lots]) => ({ symbol, lots }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [holdings]);
  const currentMonthKey = `${CURRENT_YEAR}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;

  const [pnlYear, setPnlYear] = useState("all");

  // Reconstruye el patrimonio total mes a mes, combinando el historial de
  // activos manuales (con la fecha que puso el usuario) y el valor de
  // mercado de las posiciones abiertas en cada mes (ya calculado en
  // historicalValue). Esto evita depender solo de las fotos diarias.
  const manualHistoryByMonth = useMemo(() => {
    const byName = {};
    manualAssets.forEach((a) => {
      const key = a.name.trim().toLowerCase();
      if (!byName[key]) byName[key] = [];
      byName[key].push(a);
    });
    Object.values(byName).forEach((list) => list.sort((x, y) => (x.date < y.date ? -1 : 1)));
    return byName;
  }, [manualAssets]);

  const reconstructedNetWorth = useMemo(() => {
    const months = new Set([
      ...Object.keys(historicalValue),
      ...Object.values(manualHistoryByMonth).flatMap((list) => list.map((a) => a.date.slice(0, 7))),
      currentMonthKey,
    ]);
    const sortedMonths = Array.from(months).sort();
    return sortedMonths.map((month) => {
      let manualTotalAtMonth = 0;
      Object.values(manualHistoryByMonth).forEach((list) => {
        let latest = null;
        for (const entry of list) {
          if (entry.date.slice(0, 7) <= month) latest = entry;
        }
        if (latest) manualTotalAtMonth += latest.value;
      });
      const holdingsValueAtMonth = month === currentMonthKey ? holdingsTotal : (historicalValue[month] || 0);
      return { label: month, total: manualTotalAtMonth + holdingsValueAtMonth, manual: manualTotalAtMonth, holdings: holdingsValueAtMonth };
    });
  }, [historicalValue, manualHistoryByMonth, currentMonthKey, holdingsTotal]);

  const [netWorthFilter, setNetWorthFilter] = useState("todo");
  const netWorthValueKey = netWorthFilter === "inversiones" ? "holdings" : netWorthFilter === "cuentas" ? "manual" : "total";

  const pnlYearsAvailable = useMemo(() => {
    const years = new Set([CURRENT_YEAR]);
    realizedGains.forEach((r) => years.add(r.closeDate.slice(0, 4)));
    Object.keys(historicalPnL).forEach((m) => years.add(m.slice(0, 4)));
    reconstructedNetWorth.forEach((r) => years.add(r.label.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [realizedGains, historicalPnL, reconstructedNetWorth]);

  function lastKnownNetWorth(uptoMonth, key) {
    let val = 0;
    for (const r of reconstructedNetWorth) {
      if (r.label > uptoMonth) break;
      val = r[key];
    }
    return val;
  }

  const netWorthRows = useMemo(() => {
    const key = netWorthValueKey;
    if (pnlYear === "all") {
      let prevVal = 0;
      return pnlYearsAvailable.slice().sort().map((year) => {
        const monthsInYear = reconstructedNetWorth.filter((r) => r.label.startsWith(year));
        const val = monthsInYear.length ? monthsInYear[monthsInYear.length - 1][key] : prevVal;
        prevVal = val;
        return { label: year, value: val };
      });
    }
    let prevVal = lastKnownNetWorth(`${pnlYear}-00`, key);
    const rows = MONTHS_SHORT.map((m, i) => {
      const monthKey = `${pnlYear}-${String(i + 1).padStart(2, "0")}`;
      const found = reconstructedNetWorth.find((r) => r.label === monthKey);
      const val = found ? found[key] : prevVal;
      if (found) prevVal = val;
      return { label: m, value: val };
    });
    return capMonths(rows, pnlYear, (r) => r.value !== 0);
  }, [pnlYear, netWorthValueKey, reconstructedNetWorth, pnlYearsAvailable]);

  const netWorthChartData = reconstructedNetWorth.length > 1
    ? netWorthRows
    : netWorthHistory.map((r) => ({ label: r.date.slice(5), value: r.total }));
  const netWorthChartTicks = niceTicks(0, netWorthChartData.reduce((m, r) => Math.max(m, r.value), 0), 6);

  const pnlRealizedByMonth = useMemo(() => {
    const map = {};
    realizedGains.forEach((r) => {
      const key = r.closeDate.slice(0, 7);
      map[key] = (map[key] || 0) + r.gain;
    });
    return map;
  }, [realizedGains]);

  // Serie maestra mensual: para cada mes con datos, el impacto ACUMULADO
  // total (realizado hasta ese mes + valor de mercado de lo abierto en ese
  // mes). A partir de ahi derivamos tanto el acumulado como el neto (la
  // diferencia respecto al mes anterior) sin mezclar ambos conceptos.
  const allPnlMonthsSorted = useMemo(() => {
    const set = new Set([...Object.keys(pnlRealizedByMonth), ...Object.keys(historicalPnL), currentMonthKey]);
    return Array.from(set).sort();
  }, [pnlRealizedByMonth, historicalPnL, currentMonthKey]);

  const cumulativeByMonth = useMemo(() => {
    let realizedRunning = 0;
    const map = {};
    allPnlMonthsSorted.forEach((month) => {
      realizedRunning += pnlRealizedByMonth[month] || 0;
      const unrealized = month === currentMonthKey ? totalGain : (historicalPnL[month] || 0);
      map[month] = realizedRunning + unrealized;
    });
    return map;
  }, [allPnlMonthsSorted, pnlRealizedByMonth, historicalPnL, currentMonthKey, totalGain]);

  const netByMonth = useMemo(() => {
    const map = {};
    let prev = 0;
    allPnlMonthsSorted.forEach((month, i) => {
      const cum = cumulativeByMonth[month];
      map[month] = i === 0 ? cum : cum - prev;
      prev = cum;
    });
    return map;
  }, [allPnlMonthsSorted, cumulativeByMonth]);

  function lastKnownCumulative(uptoMonth) {
    let val = 0;
    for (const m of allPnlMonthsSorted) {
      if (m > uptoMonth) break;
      val = cumulativeByMonth[m];
    }
    return val;
  }

  const pnlRows = useMemo(() => {
    if (pnlYear === "all") {
      let prevCum = 0;
      return pnlYearsAvailable.slice().sort().map((year) => {
        const monthsInYear = allPnlMonthsSorted.filter((m) => m.startsWith(year));
        const cum = monthsInYear.length ? cumulativeByMonth[monthsInYear[monthsInYear.length - 1]] : prevCum;
        const net = cum - prevCum;
        prevCum = cum;
        return { label: year, cumulative: cum, net };
      });
    }
    let prevCum = lastKnownCumulative(`${pnlYear}-00`);
    const rows = MONTHS_SHORT.map((m, i) => {
      const monthKey = `${pnlYear}-${String(i + 1).padStart(2, "0")}`;
      const hasData = monthKey in cumulativeByMonth;
      const cum = hasData ? cumulativeByMonth[monthKey] : prevCum;
      const net = hasData ? netByMonth[monthKey] : 0;
      if (hasData) prevCum = cum;
      return { label: m, cumulative: cum, net };
    });
    return capMonths(rows, pnlYear, (r) => r.net !== 0);
  }, [pnlYear, pnlYearsAvailable, allPnlMonthsSorted, cumulativeByMonth, netByMonth]);

  const pnlNetTicks = niceTicks(
    pnlRows.reduce((m, r) => Math.min(m, r.net), 0),
    pnlRows.reduce((m, r) => Math.max(m, r.net), 0),
    6
  );
  const pnlCumulativeTicks = niceTicks(
    pnlRows.reduce((m, r) => Math.min(m, r.cumulative), 0),
    pnlRows.reduce((m, r) => Math.max(m, r.cumulative), 0),
    6
  );
  const realizedTotal = realizedGains.reduce((s, r) => s + r.gain, 0);

  function exportBackup() {
    const payload = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      description: t.description,
      category: t.category,
      subcategory: t.subcategory || "",
      date: t.date,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `myfunds-backup-${currentUser}-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setAuthError("");
    const uname = normUser(loginUser);
    if (uname.length < 3) { setAuthError("El usuario debe tener al menos 3 caracteres."); return; }
    if (!/^[a-z0-9_.-]+$/.test(uname)) { setAuthError("Usa solo letras, numeros, puntos, guiones o guion bajo."); return; }
    if (loginPass.length < 6) { setAuthError("La contrasena debe tener al menos 6 caracteres."); return; }
    if (loginPass !== loginPass2) { setAuthError("Las contrasenas no coinciden."); return; }
    setAuthBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(uname),
      password: loginPass,
      options: { data: { username: uname } },
    });
    setAuthBusy(false);
    if (error) {
      if (/registered|exists/i.test(error.message)) {
        setAuthError("Ese usuario ya existe. Prueba a iniciar sesion.");
      } else {
        setAuthError(`No se pudo crear la cuenta: ${error.message} (codigo: ${error.status || "?"})`);
      }
      return;
    }
    if (!data.session) {
      setAuthError("Cuenta creada, pero falta confirmar el correo. Revisa la configuracion de Supabase (Confirm email debe estar desactivado).");
      return;
    }
    setSession(data.session);
    setLoginPass(""); setLoginPass2("");
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const uname = normUser(loginUser);
    setAuthBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(uname),
      password: loginPass,
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(`Usuario o contrasena incorrectos. (${error.message})`);
      return;
    }
    setSession(data.session);
    setLoginPass("");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setTransactions([]);
    setDataLoaded(false);
    setActiveTab("registro");
    setLoginUser(""); setLoginPass(""); setLoginPass2("");
    setManualAssets([]); setHoldings([]); setNetWorthHistory([]); setPriceMap({}); setOpenPriceEur({}); setRealizedGains([]); setNetWorthLoaded(false);
    setHistoricalPnL({}); setHistoricalValue({}); setHistoricalLoaded(false); setHistoricalError("");
    setExpandedSymbols({});
  }

  async function addTransaction(e) {
    e.preventDefault();
    const value = parseFloat(String(amount).replace(",", "."));
    if (!amount || isNaN(value) || value <= 0) { setFormError("Introduce un importe valido, mayor que cero."); return; }
    if (!date) { setFormError("Elige una fecha."); return; }
    if (!category) { setFormError("Elige una categoria."); return; }
    const hasSubs = (subConfig[category] || []).length > 0;
    if (hasSubs && !subcategory) { setFormError("Elige una subcategoria."); return; }
    setFormError("");
    const entry = {
      id: uid(), type, amount: Math.round(value * 100) / 100,
      description: desc.trim() || category,
      category, subcategory: subcategory || "", date,
    };
    const next = [entry, ...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
    const result = await persistTransactions(next);
    if (result.ok) {
      setAmount(""); setDesc(""); setSubcategory("");
    } else {
      setFormError(`No se pudo guardar: ${result.error}`);
    }
  }

  async function removeTransaction(id) {
    const result = await persistTransactions(transactions.filter((t) => t.id !== id));
    if (!result.ok) {
      setFormError(`No se pudo borrar: ${result.error}`);
    }
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
      const result = await persistTransactions(next);
      if (result.ok) {
        let msg = `Importados ${added} movimientos nuevos y guardados en la base de datos.`;
        if (skipped) msg += ` ${skipped} ya existian.`;
        if (invalid) msg += ` ${invalid} filas no validas.`;
        setImportMsg(msg);
      } else {
        setImportMsg(`Fallo al guardar (nada importado): ${result.error}`);
      }
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
  function subUsageCount(cat, subName) {
    return transactions.filter((t) => {
      if (t.category !== cat) return false;
      const cur = t.subcategory && t.subcategory.trim() ? t.subcategory : "Sin subcategoria";
      return cur === subName;
    }).length;
  }
  async function reassignCategory(kind) {
    const from = reassignFrom[kind];
    const to = reassignTo[kind];
    if (!from || !to || from === to) return;
    const count = usageCount(kind, from);
    const next = transactions.map((t) => (t.type === kind && t.category === from ? { ...t, category: to } : t));
    const result = await persistTransactions(next);
    setReassignMsg({
      ...reassignMsg,
      [kind]: result.ok ? `Movidos ${count} movimientos de "${from}" a "${to}".` : `Fallo: ${result.error}`,
    });
    if (result.ok) {
      setReassignFrom({ ...reassignFrom, [kind]: "" });
      setReassignTo({ ...reassignTo, [kind]: "" });
    }
  }
  async function reassignSubcategory() {
    if (!subEditCategory || !subReassignFrom || !subReassignTo || subReassignFrom === subReassignTo) return;
    const count = subUsageCount(subEditCategory, subReassignFrom);
    const next = transactions.map((t) => {
      if (t.category !== subEditCategory) return t;
      const cur = t.subcategory && t.subcategory.trim() ? t.subcategory : "Sin subcategoria";
      if (cur !== subReassignFrom) return t;
      return { ...t, subcategory: subReassignTo === "Sin subcategoria" ? "" : subReassignTo };
    });
    const result = await persistTransactions(next);
    setSubReassignMsg(result.ok ? `Movidos ${count} movimientos de "${subReassignFrom}" a "${subReassignTo}".` : `Fallo: ${result.error}`);
    if (result.ok) {
      setSubReassignFrom("");
      setSubReassignTo("");
    }
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

  const flowTicks = useMemo(() => {
    const max = resumenRows.reduce((m, r) => Math.max(m, r.income, r.expense), 0);
    return niceTicks(0, max, 6);
  }, [resumenRows]);
  const savingsTicks = useMemo(() => {
    const min = resumenRows.reduce((m, r) => Math.min(m, r.savings), 0);
    const max = resumenRows.reduce((m, r) => Math.max(m, r.savings), 0);
    return niceTicks(min, max, 6);
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

  const catTrendTicks = useMemo(() => {
    const max = catTrend.reduce((m, r) => Math.max(m, r.value), 0);
    return niceTicks(0, max, 6);
  }, [catTrend]);

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

  const subTrendTicks = useMemo(() => {
    const max = subTrend.reduce((m, r) => Math.max(m, r.value), 0);
    return niceTicks(0, max, 6);
  }, [subTrend]);

  const tooltipStyle = { background: PALETTE.paper, border: `1px solid ${PALETTE.rule}`, borderRadius: 3, fontFamily: FONT, fontSize: 12 };
  const allCategoryNames = useMemo(() => [...catConfig.expense, ...catConfig.income], [catConfig]);

  const sharedStyle = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
      @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
      html, body { background: ${PALETTE.cover}; margin: 0; }
      .tab-nav::-webkit-scrollbar { display: none; }
      .ledger-select, .ledger-input {
        font-family: ${FONT}; background: transparent; border: none;
        border-bottom: 1px solid ${PALETTE.rule}; padding: 6px 2px; font-size: 14px; color: ${PALETTE.ink}; outline: none; width: 100%;
      }
      .ledger-input:focus, .ledger-select:focus { border-bottom: 1px solid ${PALETTE.gold}; }
      .ledger-row:hover .del-btn { opacity: 1; }
      .del-btn { opacity: 0; transition: opacity 0.15s ease; }
      .pill-btn {
        font-family: ${FONT}; font-size: 13px; padding: 6px 14px; border-radius: 3px;
        border: 1px solid ${PALETTE.rule}; background: transparent; cursor: pointer; color: ${PALETTE.inkSoft};
      }
      .pill-btn.active { background: ${PALETTE.ink}; color: ${PALETTE.paper}; border-color: ${PALETTE.ink}; }
      .type-toggle {
        font-family: ${FONT}; font-size: 14px; padding: 8px 18px; border: 1px solid ${PALETTE.rule};
        background: transparent; cursor: pointer; color: ${PALETTE.inkSoft};
      }
      .type-toggle.active-income { background: ${PALETTE.incomeBg}; color: ${PALETTE.income}; border-color: ${PALETTE.income}; }
      .type-toggle.active-expense { background: ${PALETTE.expenseBg}; color: ${PALETTE.expense}; border-color: ${PALETTE.expense}; }
      .submit-btn {
        font-family: ${FONT}; font-size: 14px; padding: 10px 22px; background: ${PALETTE.gold};
        color: #fff; border: none; border-radius: 3px; cursor: pointer;
      }
      .submit-btn:hover { filter: brightness(0.94); }
      .tab-btn {
        font-family: ${FONT}; font-size: 14px; padding: 9px 4px; background: none; border: none;
        border-bottom: 2px solid transparent; color: ${PALETTE.inkSoft}; cursor: pointer;
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
  if (!authLoaded) {
    return (
      <div style={{ fontFamily: FONT, background: PALETTE.cover, minHeight: "100vh" }}>
        {sharedStyle}
      </div>
    );
  }

  // ---------------- Auth screen ----------------
  if (!currentUser) {
    return (
      <div style={{ fontFamily: FONT, background: PALETTE.cover, minHeight: "100vh", color: PALETTE.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
        {sharedStyle}
        <button
          onClick={toggleMode}
          aria-label={mode === "dark" ? "Cambiar a modo dia" : "Cambiar a modo noche"}
          style={{ position: "absolute", top: 20, right: 20, background: "none", border: `1px solid ${PALETTE.rule}`, borderRadius: 4, width: 38, height: 38, color: PALETTE.inkSoft, fontSize: 16, cursor: "pointer", lineHeight: 1 }}
        >
          {mode === "dark" ? "\u2600" : "\u263D"}
        </button>
        <div style={{ maxWidth: 380, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <Mark size={56} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <Wordmark size={24} color={PALETTE.ink} />
          </div>
          <h1 style={{ fontFamily: FONT, fontWeight: 500, fontSize: 26, color: PALETTE.ink, margin: "8px 0 24px", textAlign: "center" }}>
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
                <div style={{ position: "relative" }}>
                  <input className="ledger-input" type={showPass ? "text" : "password"} value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="min. 4 caracteres" style={{ paddingRight: 30 }} />
                  <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Ocultar contrasena" : "Mostrar contrasena"} style={{ position: "absolute", right: 6, top: 6, background: "none", border: "none", cursor: "pointer", color: PALETTE.inkSoft, padding: 2, display: "flex" }}>
                    <EyeIcon open={showPass} color={PALETTE.inkSoft} />
                  </button>
                </div>
              </div>
              {authMode === "register" && (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Repite la contrasena</label>
                  <div style={{ position: "relative" }}>
                    <input className="ledger-input" type={showPass2 ? "text" : "password"} value={loginPass2} onChange={(e) => setLoginPass2(e.target.value)} style={{ paddingRight: 30 }} />
                    <button type="button" onClick={() => setShowPass2((v) => !v)} aria-label={showPass2 ? "Ocultar contrasena" : "Mostrar contrasena"} style={{ position: "absolute", right: 6, top: 6, background: "none", border: "none", cursor: "pointer", color: PALETTE.inkSoft, padding: 2, display: "flex" }}>
                      <EyeIcon open={showPass2} color={PALETTE.inkSoft} />
                    </button>
                  </div>
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
          <p style={{ fontSize: 11, color: PALETTE.inkSoft, marginTop: 18, textAlign: "center", lineHeight: 1.5 }}>
            Cada usuario tiene su propio registro, separado del resto. Es una separacion de datos pensada para
            varias personas usando la misma app, no un sistema de seguridad de nivel bancario.
          </p>
        </div>
      </div>
    );
  }

  // ---------------- Main app ----------------
  return (
    <div style={{ fontFamily: FONT, background: PALETTE.cover, minHeight: "100vh", color: PALETTE.ink }}>
      {sharedStyle}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>
        <header style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontFamily: FONT, fontSize: 12, letterSpacing: 1, color: PALETTE.inkSoft, margin: "0 0 4px" }}>
              {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Mark size={40} />
              <Wordmark size={30} color={PALETTE.ink} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={toggleMode}
              aria-label={mode === "dark" ? "Cambiar a modo dia" : "Cambiar a modo noche"}
              style={{ background: "none", border: `1px solid ${PALETTE.rule}`, borderRadius: 4, width: 38, height: 38, color: PALETTE.inkSoft, fontSize: 16, cursor: "pointer", lineHeight: 1 }}
            >
              {mode === "dark" ? "\u2600" : "\u263D"}
            </button>
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
                  Editor de categorias
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
          </div>
        </header>

        <nav className="tab-nav" style={{ display: "flex", gap: 18, borderBottom: `1px solid ${PALETTE.rule}`, marginBottom: 24, overflowX: "auto", whiteSpace: "nowrap", scrollbarWidth: "none" }}>
          {TABS.map((t) => (
            <button key={t.id} className={"tab-btn" + (activeTab === t.id ? " active" : "")} style={{ flexShrink: 0 }} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </nav>

        {activeTab === "registro" && (
          <>
            <section style={{ background: PALETTE.coverSoft, borderRadius: 4, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: 0 }}>{importMsg || "Importar movimientos desde un archivo .json"}</p>
              <label style={{ fontSize: 11, color: PALETTE.ink, border: `1px solid ${PALETTE.rule}`, borderRadius: 3, padding: "5px 10px", cursor: "pointer", opacity: importing ? 0.6 : 1 }}>
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
                    <select className="ledger-select" value={category} onChange={(e) => {
                      const nextCat = e.target.value;
                      setCategory(nextCat);
                      const sorted = (subConfig[nextCat] || []).slice().sort((a, b) => a.localeCompare(b, "es"));
                      setSubcategory(sorted[0] || "");
                    }}>
                      {(catConfig[type] || []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Subcategoria</label>
                    <select className="ledger-select" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!(subConfig[category] && subConfig[category].length)}>
                      {(subConfig[category] || []).length === 0 && <option value="">Sin subcategorias</option>}
                      {(subConfig[category] || []).slice().sort((a, b) => a.localeCompare(b, "es")).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Descripcion (opcional)</label>
                    <input className="ledger-input" type="text" placeholder="Cafe con Marta" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </div>
                </div>
                {formError && <p style={{ color: PALETTE.expense, fontSize: 13, margin: "0 0 12px" }}>{formError}</p>}
                <button type="submit" className="submit-btn">Añadir {type === "income" ? "ingreso" : "gasto"}</button>
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
              ) : loadError ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <p style={{ fontFamily: FONT, fontSize: 18, color: PALETTE.expense, margin: "0 0 4px" }}>No se pudieron cargar tus movimientos</p>
                  <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: "0 0 14px" }}>Esto es un fallo de conexion, no significa que se hayan borrado. Recarga la pagina para intentarlo de nuevo.</p>
                  <button type="button" className="submit-btn" onClick={() => window.location.reload()}>Recargar</button>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <p style={{ fontFamily: FONT, fontSize: 18, color: PALETTE.ink, margin: "0 0 4px" }}>El registro esta vacio</p>
                  <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Anade tu primer movimiento arriba para empezar a llevar la cuenta.</p>
                </div>
              ) : (
                <div>
                  {filtered.map((t) => (
                    <div key={t.id} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "44px 1fr auto 22px", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${PALETTE.rule}` }}>
                      <span style={{ fontFamily: FONT, fontSize: 11, color: PALETTE.inkSoft }}>{formatDate(t.date)}</span>
                      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 14, color: PALETTE.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</span>
                        <span style={{ fontSize: 11, color: t.type === "income" ? PALETTE.income : PALETTE.expense, background: t.type === "income" ? PALETTE.incomeBg : PALETTE.expenseBg, padding: "2px 7px", borderRadius: 3, alignSelf: "flex-start", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {t.category}{t.subcategory ? ` \u203A ${t.subcategory}` : ""}
                        </span>
                      </div>
                      <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 500, textAlign: "right", whiteSpace: "nowrap", color: t.type === "income" ? PALETTE.income : PALETTE.expense }}>
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
                <option value="all">Todos los años</option>
                {yearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </section>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 20 }}>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Ingresos</p>
                <p style={{ fontFamily: FONT, fontSize: 20, color: PALETTE.income, margin: 0 }}>{formatMoneyRound(resumenTotals.income)}</p>
              </div>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Gastos</p>
                <p style={{ fontFamily: FONT, fontSize: 20, color: PALETTE.expense, margin: 0 }}>{formatMoneyRound(resumenTotals.expense)}</p>
              </div>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Ahorro</p>
                <p style={{ fontFamily: FONT, fontSize: 20, color: resumenTotals.savings >= 0 ? PALETTE.income : PALETTE.expense, margin: 0 }}>{formatMoneyRound(resumenTotals.savings)}</p>
              </div>
              <div style={{ background: PALETTE.paper, borderRadius: 4, padding: "16px 18px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Tasa de ahorro</p>
                <p style={{ fontFamily: FONT, fontSize: 20, color: PALETTE.ink, margin: 0 }}>{resumenTotals.rate.toFixed(1)}%</p>
              </div>
            </section>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 12px" }}>Ingresos vs gastos {resumenYear === "all" ? "por año" : "por mes"}</p>
              {resumenRows.every((r) => r.income === 0 && r.expense === 0) ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>No hay datos para este periodo todavia.</p>
              ) : (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={resumenRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis domain={[flowTicks[0], flowTicks[flowTicks.length - 1]]} ticks={flowTicks} allowDecimals={false} tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: PALETTE.ink }} itemStyle={{ color: PALETTE.ink }} formatter={(v) => formatMoneyRound(v)} />
                      <Bar dataKey="income" name="Ingresos" fill={PALETTE.income} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="expense" name="Gastos" fill={PALETTE.expense} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px" }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 12px" }}>Ahorro {resumenYear === "all" ? "por año" : "por mes"}</p>
              {resumenRows.every((r) => r.income === 0 && r.expense === 0) ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>No hay datos para este periodo todavia.</p>
              ) : (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={resumenRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis domain={[savingsTicks[0], savingsTicks[savingsTicks.length - 1]]} ticks={savingsTicks} allowDecimals={false} tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: PALETTE.ink }} itemStyle={{ color: PALETTE.ink }} formatter={(v) => formatMoneyRound(v)} />
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
                <option value="all">Todos los años</option>
                {yearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </section>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Gasto por categoria</p>
                <p style={{ fontFamily: FONT, fontSize: 15, color: PALETTE.ink, margin: 0 }}>{formatMoneyRound(catTotal)}</p>
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
                      <span style={{ fontFamily: FONT, fontSize: 12, width: 40, textAlign: "right", color: PALETTE.inkSoft }}>{c.pct.toFixed(0)}%</span>
                      <span style={{ fontFamily: FONT, fontSize: 13, width: 85, textAlign: "right", color: PALETTE.inkSoft }}>{formatMoneyRound(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {activeCatName && (
              <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px" }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 12px" }}>Evolucion de {activeCatName.toLowerCase()} {catYear === "all" ? "por año" : "por mes"}</p>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={catTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis domain={[catTrendTicks[0], catTrendTicks[catTrendTicks.length - 1]]} ticks={catTrendTicks} allowDecimals={false} tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: PALETTE.ink }} itemStyle={{ color: PALETTE.ink }} formatter={(v) => formatMoneyRound(v)} />
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
                      <span style={{ fontFamily: FONT, fontSize: 12, width: 40, textAlign: "right", color: PALETTE.inkSoft }}>{s.pct.toFixed(0)}%</span>
                      <span style={{ fontFamily: FONT, fontSize: 13, width: 85, textAlign: "right", color: PALETTE.inkSoft }}>{formatMoneyRound(s.total)}</span>
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
                  Evolucion de {subSelected.toLowerCase()} {catYear === "all" ? "por año" : "por mes"}
                </p>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={subTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis domain={[subTrendTicks[0], subTrendTicks[subTrendTicks.length - 1]]} ticks={subTrendTicks} allowDecimals={false} tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: PALETTE.ink }} itemStyle={{ color: PALETTE.ink }} formatter={(v) => formatMoneyRound(v)} />
                      <Line type="monotone" dataKey="value" name="Importe" stroke={PALETTE.gold} strokeWidth={2} dot={{ r: 3, fill: PALETTE.gold }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "patrimonio" && (
          <>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Patrimonio total</p>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 600, color: PALETTE.ink, margin: 0 }}>
                    {netWorthLoaded ? formatMoneyRound(netWorthTotal) : "..."}
                  </p>
                </div>
                <button
                  type="button"
                  className="submit-btn"
                  onClick={() => refreshNetWorth(holdings, manualAssets)}
                  disabled={pricesLoading || !netWorthLoaded}
                >
                  {pricesLoading ? "Actualizando..." : "Actualizar precios"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 2px" }}>Manual</p>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: PALETTE.ink, margin: 0 }}>{formatMoneyRound(manualTotal)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 2px" }}>Mercado (acciones/ETF/cripto)</p>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: PALETTE.ink, margin: 0 }}>{formatMoneyRound(holdingsTotal)}</p>
                </div>
                {holdingsWithGain.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 2px" }}>Beneficio / perdida (abiertas)</p>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: totalGain >= 0 ? PALETTE.income : PALETTE.expense, margin: 0 }}>
                      {totalGain >= 0 ? "+" : ""}{formatMoneyRound(totalGain)}
                    </p>
                  </div>
                )}
                {holdings.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 2px" }}>Hoy</p>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: totalDayChange >= 0 ? PALETTE.income : PALETTE.expense, margin: 0 }}>
                      {totalDayChange >= 0 ? "+" : ""}{formatMoneyRound(totalDayChange)}
                    </p>
                  </div>
                )}
                {realizedGains.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 2px" }}>Realizado (cerradas)</p>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: realizedTotal >= 0 ? PALETTE.income : PALETTE.expense, margin: 0 }}>
                      {realizedTotal >= 0 ? "+" : ""}{formatMoneyRound(realizedTotal)}
                    </p>
                  </div>
                )}
              </div>
              {netWorthError && <p style={{ fontSize: 12, color: PALETTE.expense, margin: "14px 0 0" }}>{netWorthError}</p>}
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Cuentas y activos manuales</p>
                <button type="button" onClick={() => { setAssetForm({ name: "", value: "", date: todayISO(), category: "Cuenta Corriente" }); setAddAssetModalOpen(true); }} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${PALETTE.rule}`, borderRadius: 14, background: "none", color: PALETTE.gold, fontSize: 12, cursor: "pointer", padding: "4px 10px 4px 6px" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${PALETTE.gold}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1 }}>+</span>
                  Anadir activo
                </button>
              </div>
              {!netWorthLoaded ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>Cargando...</p>
              ) : visibleManualAssets.length === 0 ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Sin activos manuales todavia (cuentas, efectivo, inmuebles...).</p>
              ) : (
                visibleManualAssets.map((a) => (
                  <div key={a.name.toLowerCase()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${PALETTE.rule}` }}>
                    <div>
                      <span style={{ fontSize: 14, color: PALETTE.ink }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: PALETTE.inkSoft, background: PALETTE.paperDim, padding: "2px 7px", borderRadius: 3, marginLeft: 8 }}>{a.category}</span>
                      <div style={{ fontSize: 11, color: PALETTE.inkSoft, marginTop: 2 }}>Actualizado el {formatDate(a.date)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: PALETTE.ink }}>{formatMoney(a.value)}</span>
                      <button onClick={() => removeManualAsset(a.name)} aria-label="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: PALETTE.inkSoft, fontSize: 16 }}>x</button>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: openPositionsExpanded ? 14 : 0, flexWrap: "wrap", gap: 10 }}>
                <button type="button" onClick={() => setOpenPositionsExpanded((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{ color: PALETTE.inkSoft, fontSize: 12, transform: openPositionsExpanded ? "rotate(90deg)" : "none", transition: "transform 0.12s ease", display: "inline-block" }}>{"\u203A"}</span>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Acciones, ETF y cripto abiertas ({holdings.length})</p>
                </button>
                {openPositionsExpanded && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {holdings.length > 0 && (
                      <div style={{ display: "flex" }}>
                        <button type="button" className={"type-toggle" + (holdingView === "acumulado" ? " active-income" : "")} style={{ borderRadius: "3px 0 0 3px", fontSize: 12, padding: "5px 12px" }} onClick={() => setHoldingView("acumulado")}>Acumulado</button>
                        <button type="button" className={"type-toggle" + (holdingView === "hoy" ? " active-income" : "")} style={{ borderRadius: "0 3px 3px 0", borderLeft: "none", fontSize: 12, padding: "5px 12px" }} onClick={() => setHoldingView("hoy")}>Hoy</button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setEditingHoldingId(null); setHoldingForm({ symbol: "", quantity: "", kind: "stock", openPrice: "", openDate: todayISO(), commission: "", finnhubSymbol: "" }); setSymbolPickedName(""); setSymbolResults([]); setFinnhubPickedName(""); setFinnhubResults([]); setAddHoldingModalOpen(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${PALETTE.rule}`, borderRadius: 14, background: "none", color: PALETTE.gold, fontSize: 12, cursor: "pointer", padding: "4px 10px 4px 6px" }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${PALETTE.gold}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1 }}>+</span>
                      Anadir posicion
                    </button>
                  </div>
                )}
              </div>
              {openPositionsExpanded && (
                !netWorthLoaded ? (
                  <p style={{ fontSize: 13, color: PALETTE.inkSoft }}>Cargando...</p>
                ) : holdings.length === 0 ? (
                  <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Sin posiciones todavia. Anade el simbolo (ej. AAPL, BTC/USD) y la cantidad.</p>
                ) : (
                  groupedHoldings.map((group) => {
                    const { symbol, lots } = group;
                    const quote = priceMap[symbol];
                    const price = quote ? quote.price : null;
                    const totalQuantity = lots.reduce((s, h) => s + h.quantity, 0);
                    const currentValue = price != null ? price * totalQuantity : null;

                    const lotsWithOpen = lots.filter((h) => h.openPrice != null && !isNaN(h.openPrice) && openPriceEur[h.id] != null);
                    const hasOpen = lotsWithOpen.length > 0 && price != null;
                    const accGain = hasOpen
                      ? lotsWithOpen.reduce((s, h) => s + (price - openPriceEur[h.id]) * h.quantity - (h.commission || 0), 0)
                      : null;
                    const costBasis = lotsWithOpen.reduce((s, h) => s + openPriceEur[h.id] * h.quantity, 0);
                    const accGainPct = hasOpen && costBasis > 0 ? (accGain / costBasis) * 100 : null;

                    const dayGain = quote && quote.dayChange != null ? quote.dayChange * totalQuantity : null;
                    const dayGainPct = quote ? quote.dayPercentChange : null;

                    const shownGain = holdingView === "hoy" ? dayGain : accGain;
                    const shownPct = holdingView === "hoy" ? dayGainPct : accGainPct;
                    const showRow = holdingView === "hoy" ? quote != null : hasOpen;
                    const isMulti = lots.length > 1;
                    const isExpanded = !!expandedSymbols[symbol];

                    const renderLotDetail = (h) => {
                      const openEur = openPriceEur[h.id];
                      const hasRawOpen = h.openPrice != null && !isNaN(h.openPrice);
                      const lotHasOpen = hasRawOpen && openEur != null;
                      const lotGain = lotHasOpen && price != null ? (price - openEur) * h.quantity - (h.commission || 0) : null;
                      return (
                        <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 8px 18px", borderBottom: `1px solid ${PALETTE.rule}`, gap: 10 }}>
                          <div>
                            <span style={{ fontSize: 13, color: PALETTE.ink }}>{h.quantity} uds</span>
                            {hasRawOpen && (
                              <div style={{ fontSize: 11, color: PALETTE.inkSoft, marginTop: 2 }}>
                                Abierta a {h.openPrice.toFixed(2)}{quote && quote.currency ? ` ${quote.currency}` : ""}
                                {openEur != null && quote && quote.currency && quote.currency !== "EUR" ? ` (${formatMoney(openEur)})` : ""}
                                {h.openDate ? ` el ${formatDate(h.openDate)}` : ""}
                                {h.commission ? ` · comision ${formatMoney(h.commission)}` : ""}
                                {hasRawOpen && !lotHasOpen && " · cambio no disponible"}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {lotGain != null && (
                              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: lotGain >= 0 ? PALETTE.income : PALETTE.expense }}>
                                {lotGain >= 0 ? "+" : ""}{formatMoney(lotGain)}
                              </span>
                            )}
                            <button onClick={() => startEditHolding(h)} aria-label="Editar" style={{ background: "none", border: `1px solid ${PALETTE.rule}`, borderRadius: 3, cursor: "pointer", color: PALETTE.inkSoft, fontSize: 11, padding: "4px 8px" }}>Editar</button>
                            <button onClick={() => startClosePosition(h)} aria-label="Cerrar posicion" style={{ background: "none", border: `1px solid ${PALETTE.rule}`, borderRadius: 3, cursor: "pointer", color: PALETTE.inkSoft, fontSize: 11, padding: "4px 8px" }}>Cerrar</button>
                            <button onClick={() => removeHolding(h.id)} aria-label="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: PALETTE.inkSoft, fontSize: 16 }}>x</button>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div key={symbol}>
                        <div
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: isMulti && isExpanded ? "none" : `1px solid ${PALETTE.rule}`, gap: 10, cursor: isMulti ? "pointer" : "default" }}
                          onClick={isMulti ? () => setExpandedSymbols({ ...expandedSymbols, [symbol]: !isExpanded }) : undefined}
                        >
                          <div>
                            <span style={{ fontSize: 14, color: PALETTE.ink }}>
                              {isMulti && <span style={{ display: "inline-block", marginRight: 6, color: PALETTE.inkSoft, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.12s ease" }}>{"\u203A"}</span>}
                              {symbol}
                            </span>
                            <span style={{ fontSize: 12, color: PALETTE.inkSoft, marginLeft: 8 }}>{totalQuantity} uds{isMulti ? ` · ${lots.length} compras` : ""}</span>
                            {!isMulti && lots[0].openPrice != null && !isNaN(lots[0].openPrice) && (
                              <div style={{ fontSize: 11, color: PALETTE.inkSoft, marginTop: 2 }}>
                                Abierta a {lots[0].openPrice.toFixed(2)}{quote && quote.currency ? ` ${quote.currency}` : ""}
                                {openPriceEur[lots[0].id] != null && quote && quote.currency && quote.currency !== "EUR" ? ` (${formatMoney(openPriceEur[lots[0].id])})` : ""}
                                {lots[0].openDate ? ` el ${formatDate(lots[0].openDate)}` : ""}
                                {lots[0].commission ? ` · comision ${formatMoney(lots[0].commission)}` : ""}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: PALETTE.ink }}>
                                {currentValue != null ? formatMoney(currentValue) : "..."}
                              </div>
                              {showRow && shownGain != null && (
                                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: shownGain >= 0 ? PALETTE.income : PALETTE.expense }}>
                                  {shownGain >= 0 ? "+" : ""}{formatMoney(shownGain)}
                                  {shownPct != null && ` (${shownPct >= 0 ? "+" : ""}${shownPct.toFixed(2)}%)`}
                                </div>
                              )}
                            </div>
                            {!isMulti && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); startEditHolding(lots[0]); }} aria-label="Editar" style={{ background: "none", border: `1px solid ${PALETTE.rule}`, borderRadius: 3, cursor: "pointer", color: PALETTE.inkSoft, fontSize: 11, padding: "4px 8px" }}>Editar</button>
                                <button onClick={(e) => { e.stopPropagation(); startClosePosition(lots[0]); }} aria-label="Cerrar posicion" style={{ background: "none", border: `1px solid ${PALETTE.rule}`, borderRadius: 3, cursor: "pointer", color: PALETTE.inkSoft, fontSize: 11, padding: "4px 8px" }}>Cerrar</button>
                                <button onClick={(e) => { e.stopPropagation(); removeHolding(lots[0].id); }} aria-label="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: PALETTE.inkSoft, fontSize: 16 }}>x</button>
                              </>
                            )}
                          </div>
                        </div>
                        {isMulti && isExpanded && (
                          <div style={{ borderBottom: `1px solid ${PALETTE.rule}` }}>
                            {lots.map((h) => renderLotDetail(h))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              )}
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "20px 24px" }}>
              <button type="button" onClick={() => setClosedPositionsExpanded((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: closedPositionsExpanded ? 14 : 0 }}>
                <span style={{ color: PALETTE.inkSoft, fontSize: 12, transform: closedPositionsExpanded ? "rotate(90deg)" : "none", transition: "transform 0.12s ease", display: "inline-block" }}>{"\u203A"}</span>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Posiciones cerradas ({realizedGains.length})</p>
              </button>
              {closedPositionsExpanded && (
                realizedGains.length === 0 ? (
                  <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Todavia no has cerrado ninguna posicion.</p>
                ) : (
                  realizedGains.slice().reverse().map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${PALETTE.rule}` }}>
                      <div>
                        <span style={{ fontSize: 14, color: PALETTE.ink }}>{r.symbol}</span>
                        <span style={{ fontSize: 12, color: PALETTE.inkSoft, marginLeft: 8 }}>{r.quantity} uds</span>
                        <div style={{ fontSize: 11, color: PALETTE.inkSoft, marginTop: 2 }}>
                          Cerrada el {formatDate(r.closeDate)}{r.notes ? ` · ${r.notes}` : ""}
                        </div>
                      </div>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: r.gain >= 0 ? PALETTE.income : PALETTE.expense }}>
                        {r.gain >= 0 ? "+" : ""}{formatMoney(r.gain)}
                      </span>
                    </div>
                  ))
                )
              )}
            </section>

            {addAssetModalOpen && (
              <div onClick={() => setAddAssetModalOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: PALETTE.paper, borderRadius: 6, padding: "22px 24px", maxWidth: 340, width: "100%" }}>
                  <p style={{ fontSize: 13, color: PALETTE.ink, margin: "0 0 4px", fontWeight: 500 }}>Nuevo valor de un activo manual</p>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 14px" }}>
                    Si usas el mismo nombre que ya tienes, se guarda como una actualizacion de esa cuenta (con historial) en vez de crear una nueva.
                  </p>
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Nombre</label>
                  <input
                    className="ledger-input"
                    autoFocus
                    list="manual-asset-names"
                    placeholder="Ej. Cuenta corriente"
                    value={assetForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const match = visibleManualAssets.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
                      setAssetForm({ ...assetForm, name, category: match ? match.category : assetForm.category });
                    }}
                    style={{ marginBottom: 12 }}
                  />
                  <datalist id="manual-asset-names">
                    {visibleManualAssets.map((a) => <option key={a.name} value={a.name} />)}
                  </datalist>
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Categoria</label>
                  <select className="ledger-select" value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })} style={{ marginBottom: 12 }}>
                    <option value="Cuenta Corriente">Cuenta Corriente</option>
                    <option value="Cuenta remunerada">Cuenta remunerada</option>
                    <option value="Apuestas">Apuestas</option>
                    <option value="PayPal">PayPal</option>
                  </select>
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Valor (EUR)</label>
                  <input className="ledger-input" placeholder="0,00" value={assetForm.value} onChange={(e) => setAssetForm({ ...assetForm, value: e.target.value })} style={{ marginBottom: 12 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualAsset(); } }} />
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Fecha de este valor</label>
                  <input className="ledger-input" type="date" value={assetForm.date} onChange={(e) => setAssetForm({ ...assetForm, date: e.target.value })} />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                    <button type="button" className="pill-btn" onClick={() => setAddAssetModalOpen(false)}>Cancelar</button>
                    <button type="button" className="submit-btn" onClick={addManualAsset}>Guardar</button>
                  </div>
                </div>
              </div>
            )}

            {addHoldingModalOpen && (
              <div onClick={() => { setAddHoldingModalOpen(false); setEditingHoldingId(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: PALETTE.paper, borderRadius: "10px 10px 0 0", padding: "20px 20px 16px",
                    maxWidth: 420, width: "100%", maxHeight: "90vh", overflowY: "auto",
                    boxShadow: "0 -8px 30px rgba(0,0,0,0.3)", boxSizing: "border-box",
                  }}
                >
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: PALETTE.rule, margin: "0 auto 16px" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <p style={{ fontSize: 15, color: PALETTE.ink, margin: 0, fontWeight: 600 }}>{editingHoldingId ? "Editar posicion" : "Nueva posicion"}</p>
                    <button type="button" onClick={() => { setAddHoldingModalOpen(false); setEditingHoldingId(null); }} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", color: PALETTE.inkSoft, fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
                  </div>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 16px" }}>Simbolo tal cual en el mercado: AAPL, MSFT, VWCE, BTC/USD...</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 12px", marginBottom: 14 }}>
                    <div style={{ gridColumn: "1 / -1", position: "relative" }}>
                      <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Simbolo</label>
                      <input
                        className="ledger-input"
                        autoFocus
                        autoCapitalize="characters"
                        placeholder="Busca por nombre o simbolo: Apple, BTC..."
                        value={holdingForm.symbol}
                        onChange={(e) => { setSymbolPickedName(""); setHoldingForm({ ...holdingForm, symbol: e.target.value }); }}
                        autoComplete="off"
                      />
                      {symbolSearching && (
                        <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "4px 0 0" }}>Buscando...</p>
                      )}
                      {symbolResults.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: PALETTE.paper, border: `1px solid ${PALETTE.rule}`, borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: "auto", zIndex: 60, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
                          {symbolResults.map((r, i) => (
                            <button
                              key={`${r.symbol}-${i}`}
                              type="button"
                              onClick={() => pickSymbolResult(r)}
                              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: i < symbolResults.length - 1 ? `1px solid ${PALETTE.rule}` : "none", cursor: "pointer", padding: "9px 12px" }}
                            >
                              <div style={{ fontSize: 13, color: PALETTE.ink }}>{r.symbol} <span style={{ color: PALETTE.inkSoft, fontWeight: 400 }}>— {r.instrument_name}</span></div>
                              <div style={{ fontSize: 11, color: PALETTE.inkSoft, marginTop: 1 }}>{r.exchange}{r.currency ? ` · ${r.currency}` : ""}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Cantidad</label>
                      <input className="ledger-input" inputMode="decimal" placeholder="Ej. 10" value={holdingForm.quantity} onChange={(e) => setHoldingForm({ ...holdingForm, quantity: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveHolding(); } }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Tipo</label>
                      <select className="ledger-select" value={holdingForm.kind} onChange={(e) => setHoldingForm({ ...holdingForm, kind: e.target.value })}>
                        <option value="stock">Accion</option>
                        <option value="etf">ETF / Fondo</option>
                        <option value="crypto">Cripto</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ background: PALETTE.paperDim, borderRadius: 8, padding: "14px 14px 4px", marginBottom: 14 }}>
                    <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 12px" }}>
                      Opcional — para calcular la ganancia o perdida de posiciones abiertas en el pasado
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 12px" }}>
                      <div>
                        <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Precio de apertura</label>
                        <input className="ledger-input" inputMode="decimal" placeholder="Por unidad" value={holdingForm.openPrice} onChange={(e) => setHoldingForm({ ...holdingForm, openPrice: e.target.value })} style={{ marginBottom: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Fecha de apertura</label>
                        <input className="ledger-input" type="date" value={holdingForm.openDate} onChange={(e) => setHoldingForm({ ...holdingForm, openDate: e.target.value })} style={{ marginBottom: 12 }} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Comision aplicada (EUR)</label>
                        <input className="ledger-input" inputMode="decimal" placeholder="0,00" value={holdingForm.commission} onChange={(e) => setHoldingForm({ ...holdingForm, commission: e.target.value })} style={{ marginBottom: 12 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveHolding(); } }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ background: PALETTE.paperDim, borderRadius: 8, padding: "14px 14px 4px", marginBottom: 18 }}>
                    <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 12px" }}>
                      Opcional — si Twelve Data no cubre este mercado (ej. bolsas europeas), busca aqui el equivalente en Yahoo Finance. Solo se usa para el precio actual, no para el historico.
                    </p>
                    <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Simbolo alternativo (Yahoo Finance)</label>
                    <div style={{ position: "relative" }}>
                      <input
                        className="ledger-input"
                        placeholder="Busca por nombre o simbolo: IUSN, Apple..."
                        value={holdingForm.finnhubSymbol}
                        onChange={(e) => { setFinnhubPickedName(""); setHoldingForm({ ...holdingForm, finnhubSymbol: e.target.value }); }}
                        autoComplete="off"
                        style={{ marginBottom: 12 }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveHolding(); } }}
                      />
                      {finnhubSearching && (
                        <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "-8px 0 8px" }}>Buscando en Yahoo Finance...</p>
                      )}
                      {finnhubResults.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: PALETTE.paper, border: `1px solid ${PALETTE.rule}`, borderRadius: 6, marginTop: -8, maxHeight: 220, overflowY: "auto", zIndex: 60, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
                          {finnhubResults.map((r, i) => (
                            <button
                              key={`${r.symbol}-${i}`}
                              type="button"
                              onClick={() => pickFinnhubResult(r)}
                              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: i < finnhubResults.length - 1 ? `1px solid ${PALETTE.rule}` : "none", cursor: "pointer", padding: "9px 12px" }}
                            >
                              <div style={{ fontSize: 13, color: PALETTE.ink }}>{r.symbol} <span style={{ color: PALETTE.inkSoft, fontWeight: 400 }}>— {r.shortname || r.longname || ""}</span></div>
                              {r.exchDisp && <div style={{ fontSize: 11, color: PALETTE.inkSoft, marginTop: 1 }}>{r.exchDisp}{r.typeDisp ? ` · ${r.typeDisp}` : ""}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {netWorthError && <p style={{ fontSize: 12, color: PALETTE.expense, margin: "0 0 12px" }}>{netWorthError}</p>}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, position: "sticky", bottom: 0, background: PALETTE.paper, paddingTop: 4 }}>
                    <button type="button" className="pill-btn" onClick={() => { setAddHoldingModalOpen(false); setEditingHoldingId(null); setNetWorthError(""); }}>Cancelar</button>
                    <button type="button" className="submit-btn" onClick={saveHolding}>{editingHoldingId ? "Guardar" : "Anadir"}</button>
                  </div>
                </div>
              </div>
            )}

            {closeModalHolding && (
              <div onClick={() => setCloseModalHolding(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: PALETTE.paper, borderRadius: 6, padding: "22px 24px", maxWidth: 340, width: "100%" }}>
                  <p style={{ fontSize: 13, color: PALETTE.ink, margin: "0 0 4px", fontWeight: 500 }}>Cerrar posicion: {closeModalHolding.symbol}</p>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 14px" }}>
                    El beneficio/perdida se calcula con el precio actual. Si tu broker te da otro numero exacto, cambialo aqui.
                  </p>
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Fecha de cierre</label>
                  <input className="ledger-input" type="date" value={closeForm.closeDate} onChange={(e) => setCloseForm({ ...closeForm, closeDate: e.target.value })} style={{ marginBottom: 12 }} />
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Beneficio / perdida (EUR)</label>
                  <input className="ledger-input" value={closeForm.gain} onChange={(e) => setCloseForm({ ...closeForm, gain: e.target.value })} style={{ marginBottom: 12 }} />
                  <label style={{ fontSize: 11, color: PALETTE.inkSoft }}>Notas (opcional)</label>
                  <input className="ledger-input" placeholder="Ej. Venta parcial" value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmClosePosition(); } }} />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                    <button type="button" className="pill-btn" onClick={() => setCloseModalHolding(null)}>Cancelar</button>
                    <button type="button" className="submit-btn" onClick={confirmClosePosition}>Cerrar posicion</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "evolucion" && (
          <>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 6px" }}>Patrimonio total (hoy)</p>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 600, color: PALETTE.ink, margin: 0 }}>
                {netWorthLoaded ? formatMoneyRound(netWorthTotal) : "..."}
              </p>
            </section>

            {netWorthChartData.length > 1 && (
              <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Evolucion del patrimonio</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <select className="pill-btn" style={{ cursor: "pointer", background: PALETTE.paper }} value={pnlYear} onChange={(e) => setPnlYear(e.target.value)}>
                      <option value="all">Todos los anos</option>
                      {pnlYearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <div style={{ display: "flex" }}>
                      <button type="button" className={"type-toggle" + (netWorthFilter === "todo" ? " active-income" : "")} style={{ borderRadius: "3px 0 0 0", fontSize: 12, padding: "5px 10px" }} onClick={() => setNetWorthFilter("todo")}>Todo</button>
                      <button type="button" className={"type-toggle" + (netWorthFilter === "inversiones" ? " active-income" : "")} style={{ borderRadius: 0, borderLeft: "none", fontSize: 12, padding: "5px 10px" }} onClick={() => setNetWorthFilter("inversiones")}>Inversiones</button>
                      <button type="button" className={"type-toggle" + (netWorthFilter === "cuentas" ? " active-income" : "")} style={{ borderRadius: "0 3px 0 0", borderLeft: "none", fontSize: 12, padding: "5px 10px" }} onClick={() => setNetWorthFilter("cuentas")}>Cuentas</button>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 12px" }}>
                  {pnlYear === "all" ? "Un punto por ano (el ultimo valor conocido)." : "Desglosado mes a mes para ese ano."} Reconstruida con el historial de tus activos manuales y el valor de mercado.
                </p>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={netWorthChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis domain={[netWorthChartTicks[0], netWorthChartTicks[netWorthChartTicks.length - 1]]} ticks={netWorthChartTicks} allowDecimals={false} tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: PALETTE.ink }} itemStyle={{ color: PALETTE.ink }} formatter={(v) => formatMoney(v)} />
                      <Line type="monotone" dataKey="value" name="Patrimonio" stroke={PALETTE.gold} strokeWidth={2} dot={{ r: 3, fill: PALETTE.gold }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Beneficios / perdidas: acumulado</p>
                <select className="pill-btn" style={{ cursor: "pointer", background: PALETTE.paper }} value={pnlYear} onChange={(e) => setPnlYear(e.target.value)}>
                  <option value="all">Todos los anos</option>
                  {pnlYearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 4px" }}>
                Nunca vuelve a cero: es la suma de todo lo realizado hasta ese momento mas el valor de lo que sigue abierto, reconstruido con precios historicos.
              </p>
              {historicalLoading && <p style={{ fontSize: 11, color: PALETTE.gold, margin: "0 0 12px" }}>Reconstruyendo historico de precios...</p>}
              {historicalError && <p style={{ fontSize: 11, color: PALETTE.expense, margin: "0 0 12px" }}>{historicalError}</p>}
              {!historicalLoading && <div style={{ marginBottom: 12 }} />}
              {pnlRows.every((r) => r.cumulative === 0) ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Todavia no hay beneficios o perdidas que mostrar.</p>
              ) : (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={pnlRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis domain={[pnlCumulativeTicks[0], pnlCumulativeTicks[pnlCumulativeTicks.length - 1]]} ticks={pnlCumulativeTicks} allowDecimals={false} tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: PALETTE.ink }} itemStyle={{ color: PALETTE.ink }} formatter={(v) => formatMoney(v)} />
                      <Line type="monotone" dataKey="cumulative" name="Acumulado" stroke={PALETTE.gold} strokeWidth={2} dot={{ r: 3, fill: PALETTE.gold }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 28px" }}>
              <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 4px" }}>Beneficios / perdidas: neto por periodo</p>
              <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 12px" }}>
                Lo ganado o perdido solo en ese mes o ano, sin arrastrar lo de periodos anteriores. Usa el mismo selector de arriba.
              </p>
              {pnlRows.every((r) => r.net === 0) ? (
                <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: 0 }}>Todavia no hay beneficios o perdidas que mostrar.</p>
              ) : (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={pnlRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={PALETTE.rule} vertical={false} />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={{ stroke: PALETTE.rule }} tickLine={false} />
                      <YAxis domain={[pnlNetTicks[0], pnlNetTicks[pnlNetTicks.length - 1]]} ticks={pnlNetTicks} allowDecimals={false} tick={{ fontSize: 10, fill: PALETTE.inkSoft, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoneyAxis(v)} width={52} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: PALETTE.ink }} itemStyle={{ color: PALETTE.ink }} formatter={(v) => formatMoney(v)} />
                      <Bar dataKey="net" name="Neto" radius={[2, 2, 0, 0]}>
                        {pnlRows.map((r, i) => <Cell key={i} fill={r.net >= 0 ? PALETTE.income : PALETTE.expense} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "ajustes" && (
          <>
            <section style={{ background: PALETTE.coverSoft, borderRadius: 4, padding: "16px 24px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <p style={{ fontSize: 13, color: PALETTE.ink, margin: "0 0 2px" }}>Copia de seguridad</p>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>
                  Descarga un archivo con todos tus movimientos ({transactions.length}). Guardalo en un sitio seguro, por si el navegador borra los datos algun dia.
                </p>
              </div>
              <button type="button" className="submit-btn" onClick={exportBackup} disabled={transactions.length === 0}>Descargar mis datos</button>
            </section>
            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Editor de categorias</p>
                <button
                  type="button"
                  onClick={() => setAddCatModalOpen(true)}
                  aria-label="Anadir categoria"
                  style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${PALETTE.rule}`, borderRadius: 14, background: "none", color: PALETTE.gold, fontSize: 12, cursor: "pointer", padding: "4px 10px 4px 6px" }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${PALETTE.gold}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1 }}>+</span>
                  Anadir categoria
                </button>
              </div>
              <div style={{ display: "flex", gap: 0, marginBottom: 14 }}>
                <button type="button" className={"type-toggle" + (catEditType === "expense" ? " active-expense" : "")} style={{ borderRadius: "3px 0 0 3px", fontSize: 12, padding: "5px 12px" }} onClick={() => setCatEditType("expense")}>Gasto</button>
                <button type="button" className={"type-toggle" + (catEditType === "income" ? " active-income" : "")} style={{ borderRadius: "0 3px 3px 0", borderLeft: "none", fontSize: 12, padding: "5px 12px" }} onClick={() => setCatEditType("income")}>Ingreso</button>
              </div>
              <div>
                {catConfig[catEditType].map((c) => (
                  <span key={c} className="chip">
                    {c}{usageCount(catEditType, c) > 0 ? ` (${usageCount(catEditType, c)})` : ""}
                    <button className="chip-x" onClick={() => removeCategory(catEditType, c)} aria-label={`Eliminar ${c}`}>x</button>
                  </span>
                ))}
              </div>
              {catConfig[catEditType].length > 1 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${PALETTE.rule}` }}>
                  <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 8px" }}>Mover movimientos de una categoria a otra</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select className="ledger-select" style={{ width: "auto", flex: "1 1 130px" }} value={reassignFrom[catEditType]} onChange={(e) => setReassignFrom({ ...reassignFrom, [catEditType]: e.target.value })}>
                      <option value="">De...</option>
                      {catConfig[catEditType].map((c) => <option key={c} value={c}>{c} ({usageCount(catEditType, c)})</option>)}
                    </select>
                    <select className="ledger-select" style={{ width: "auto", flex: "1 1 130px" }} value={reassignTo[catEditType]} onChange={(e) => setReassignTo({ ...reassignTo, [catEditType]: e.target.value })}>
                      <option value="">A...</option>
                      {catConfig[catEditType].filter((c) => c !== reassignFrom[catEditType]).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button type="button" className="pill-btn" disabled={!reassignFrom[catEditType] || !reassignTo[catEditType]} onClick={() => reassignCategory(catEditType)}>Mover</button>
                  </div>
                  {reassignMsg[catEditType] && <p style={{ fontSize: 12, color: PALETTE.gold, margin: "8px 0 0" }}>{reassignMsg[catEditType]}</p>}
                </div>
              )}
            </section>

            {addCatModalOpen && (
              <div
                onClick={() => setAddCatModalOpen(false)}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}
              >
                <div onClick={(e) => e.stopPropagation()} style={{ background: PALETTE.paper, borderRadius: 6, padding: "22px 24px", maxWidth: 340, width: "100%" }}>
                  <p style={{ fontSize: 13, color: PALETTE.ink, margin: "0 0 4px", fontWeight: 500 }}>
                    Nueva categoria de {catEditType === "income" ? "ingreso" : "gasto"}
                  </p>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 14px" }}>Escribe el nombre y anadela a la lista.</p>
                  <input
                    className="ledger-input"
                    autoFocus
                    placeholder="Nombre de la categoria"
                    value={newCatName[catEditType]}
                    onChange={(e) => setNewCatName({ ...newCatName, [catEditType]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(catEditType); setAddCatModalOpen(false); } if (e.key === "Escape") setAddCatModalOpen(false); }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                    <button type="button" className="pill-btn" onClick={() => setAddCatModalOpen(false)}>Cancelar</button>
                    <button type="button" className="submit-btn" onClick={() => { addCategory(catEditType); setAddCatModalOpen(false); }}>Anadir</button>
                  </div>
                </div>
              </div>
            )}

            <section style={{ background: PALETTE.paper, borderRadius: 4, padding: "24px 32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0 }}>Subcategorias</p>
                {subEditCategory && (
                  <button
                    type="button"
                    onClick={() => setAddSubModalOpen(true)}
                    aria-label="Anadir subcategoria"
                    style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${PALETTE.rule}`, borderRadius: 14, background: "none", color: PALETTE.gold, fontSize: 12, cursor: "pointer", padding: "4px 10px 4px 6px" }}
                  >
                    <span style={{ width: 18, height: 18, borderRadius: "50%", border: `1px solid ${PALETTE.gold}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1 }}>+</span>
                    Anadir subcategoria
                  </button>
                )}
              </div>
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
                  {(subConfig[subEditCategory] || []).length > 1 && (
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${PALETTE.rule}` }}>
                      <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: "0 0 8px" }}>Mover movimientos de una subcategoria a otra</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <select className="ledger-select" style={{ width: "auto", flex: "1 1 130px" }} value={subReassignFrom} onChange={(e) => setSubReassignFrom(e.target.value)}>
                          <option value="">De...</option>
                          {(subConfig[subEditCategory] || []).map((s) => <option key={s} value={s}>{s} ({subUsageCount(subEditCategory, s)})</option>)}
                        </select>
                        <select className="ledger-select" style={{ width: "auto", flex: "1 1 130px" }} value={subReassignTo} onChange={(e) => setSubReassignTo(e.target.value)}>
                          <option value="">A...</option>
                          {(subConfig[subEditCategory] || []).filter((s) => s !== subReassignFrom).map((s) => <option key={s} value={s}>{s}</option>)}
                          <option value="Sin subcategoria">Sin subcategoria</option>
                        </select>
                        <button type="button" className="pill-btn" disabled={!subReassignFrom || !subReassignTo} onClick={reassignSubcategory}>Mover</button>
                      </div>
                      {subReassignMsg && <p style={{ fontSize: 12, color: PALETTE.gold, margin: "8px 0 0" }}>{subReassignMsg}</p>}
                    </div>
                  )}
                </>
              )}
            </section>

            {addSubModalOpen && (
              <div
                onClick={() => setAddSubModalOpen(false)}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}
              >
                <div onClick={(e) => e.stopPropagation()} style={{ background: PALETTE.paper, borderRadius: 6, padding: "22px 24px", maxWidth: 340, width: "100%" }}>
                  <p style={{ fontSize: 13, color: PALETTE.ink, margin: "0 0 4px", fontWeight: 500 }}>
                    Nueva subcategoria de {subEditCategory}
                  </p>
                  <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: "0 0 14px" }}>Escribe el nombre y anadela a la lista.</p>
                  <input
                    className="ledger-input"
                    autoFocus
                    placeholder="Nombre de la subcategoria"
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubcategory(); setAddSubModalOpen(false); } if (e.key === "Escape") setAddSubModalOpen(false); }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                    <button type="button" className="pill-btn" onClick={() => setAddSubModalOpen(false)}>Cancelar</button>
                    <button type="button" className="submit-btn" onClick={() => { addSubcategory(); setAddSubModalOpen(false); }}>Anadir</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {storageError && (
          <p style={{ marginTop: 16, fontSize: 12, color: PALETTE.inkSoft }}>No se pudo guardar en este momento. Tus datos de esta sesion siguen visibles, pero podrian no persistir.</p>
        )}
      </div>
    </div>
  );
}
