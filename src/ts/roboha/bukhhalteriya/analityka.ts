// src/ts/roboha/bukhhalteriya/analityka.ts
// 📊 Аналітика — Dashboard для бухгалтерії (Priority #3)

import ApexCharts from "apexcharts";
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";

// ===================== ІНТЕРФЕЙСИ =====================

interface ActRow {
  act_id: number;
  date_on: string | null;
  date_off: string | null;
  rosraxovano: string | null;
  data: ActData | null;
  avans: number | string | null;
  tupOplatu: string | null;
  client_id: number | null;
}

interface ActData {
  "Прибуток за деталі"?: number;
  "Прибуток за роботу"?: number;
  "За деталі"?: number;
  "За роботу"?: number;
  Знижка?: number;
  Роботи?: Array<{
    Робота?: string;
    Кількість?: number;
    Ціна?: number;
    Зарплата?: number;
    Прибуток?: number;
  }>;
  Деталі?: Array<{
    Деталь?: string;
    Кількість?: number;
    Ціна?: number;
    sclad_id?: number;
  }>;
}

interface SlyusarRow {
  slyusar_id: number;
  data: {
    Name: string;
    Доступ?: string;
    ПроцентРоботи?: number;
    Історія?: Record<
      string,
      Array<{
        Акт: string;
        СуммаРоботи: number;
        ДатаЗакриття: string | null;
        Записи?: Array<{
          Ціна: number;
          Робота: string;
          Кількість: number;
          Зарплата?: number;
          Розраховано?: string;
        }>;
      }>
    >;
  };
}

interface VutratuRow {
  vutratu_id: number;
  dataOnn: string | null;
  kategoria: string | null;
  suma: number;
  act: number | null;
  opys_vytraty: string | null;
}

interface MonthlyRevenue {
  month: string; // "2025-01"
  label: string; // "Січ 2025"
  revenue: number; // дохід
  expenses: number; // витрати
  profit: number; // прибуток
  actsCount: number; // кількість актів
}

interface TopWork {
  name: string;
  totalRevenue: number;
  count: number;
}

interface MechanicStats {
  name: string;
  actsCount: number;
  totalEarned: number; // скільки заробив для СТО
  totalSalary: number; // скільки зарплата
  avgPerAct: number; // середня сума акту
}

interface Anomaly {
  type: "warning" | "danger" | "info";
  icon: string;
  message: string;
}

// ===================== СТАН МОДУЛЯ =====================

let revenueChart: ApexCharts | null = null;
let topWorksChart: ApexCharts | null = null;
let mechanicsChart: ApexCharts | null = null;
let isLoading = false;

// Кешовані дані
let cachedActs: ActRow[] = [];
let cachedSlyusars: SlyusarRow[] = [];
let cachedVutratu: VutratuRow[] = [];

// ===================== ЗАВАНТАЖЕННЯ ДАНИХ =====================

async function loadAnalyticsData(): Promise<boolean> {
  try {
    // Паралельне завантаження всіх даних
    const [actsRes, slyusarsRes, vutratuRes] = await Promise.all([
      supabase
        .from("acts")
        .select(
          "act_id, date_on, date_off, rosraxovano, data, avans, tupOplatu, client_id",
        )
        .order("date_on", { ascending: false }),
      supabase.from("slyusars").select("slyusar_id, data"),
      supabase
        .from("vutratu")
        .select("vutratu_id, dataOnn, kategoria, suma, act, opys_vytraty")
        .order("dataOnn", { ascending: false }),
    ]);

    if (actsRes.error) throw actsRes.error;
    if (slyusarsRes.error) throw slyusarsRes.error;
    if (vutratuRes.error) throw vutratuRes.error;

    cachedActs = (actsRes.data || []) as ActRow[];
    cachedSlyusars = (slyusarsRes.data || []) as SlyusarRow[];
    cachedVutratu = (vutratuRes.data || []) as VutratuRow[];

    return true;
  } catch (err) {
    console.error("❌ Помилка завантаження аналітики:", err);
    showNotification("Помилка завантаження даних аналітики", "error");
    return false;
  }
}

// ===================== ОБЧИСЛЕННЯ =====================

/** Дохід по місяцях (останні 12 місяців) */
function calcMonthlyRevenue(): MonthlyRevenue[] {
  const monthMap = new Map<string, MonthlyRevenue>();
  const monthNames = [
    "Січ",
    "Лют",
    "Бер",
    "Кві",
    "Тра",
    "Чер",
    "Лип",
    "Сер",
    "Вер",
    "Жов",
    "Лис",
    "Гру",
  ];

  // Дохід з актів (по date_off — закриті)
  for (const act of cachedActs) {
    const dateStr = act.date_off || act.date_on;
    if (!dateStr) continue;

    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

    if (!monthMap.has(key)) {
      monthMap.set(key, {
        month: key,
        label,
        revenue: 0,
        expenses: 0,
        profit: 0,
        actsCount: 0,
      });
    }
    const m = monthMap.get(key)!;

    const data = act.data;
    if (data) {
      const workRev = data["За роботу"] || 0;
      const detailRev = data["За деталі"] || 0;
      m.revenue += workRev + detailRev;
    }
    m.actsCount++;
  }

  // Витрати (тільки від'ємні суми без актів)
  for (const v of cachedVutratu) {
    if (!v.dataOnn || v.act) continue;
    const d = new Date(v.dataOnn);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

    if (!monthMap.has(key)) {
      monthMap.set(key, {
        month: key,
        label,
        revenue: 0,
        expenses: 0,
        profit: 0,
        actsCount: 0,
      });
    }
    const m = monthMap.get(key)!;
    if (v.suma < 0) {
      m.expenses += Math.abs(v.suma);
    }
  }

  // Підраховуємо прибуток
  for (const m of monthMap.values()) {
    m.profit = m.revenue - m.expenses;
  }

  // Сортуємо по місяцю та беремо останні 12
  const sorted = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  return sorted.slice(-12);
}

/** Топ-10 найприбутковіших робіт */
function calcTopWorks(): TopWork[] {
  const workMap = new Map<string, TopWork>();

  for (const act of cachedActs) {
    const works = act.data?.Роботи;
    if (!works) continue;

    for (const w of works) {
      const name = w.Робота?.trim();
      if (!name) continue;
      const price = (w.Ціна || 0) * (w.Кількість || 1);

      if (!workMap.has(name)) {
        workMap.set(name, { name, totalRevenue: 0, count: 0 });
      }
      const tw = workMap.get(name)!;
      tw.totalRevenue += price;
      tw.count++;
    }
  }

  return Array.from(workMap.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10);
}

/** Ефективність механіків */
function calcMechanicStats(): MechanicStats[] {
  const stats: MechanicStats[] = [];

  for (const s of cachedSlyusars) {
    const data = s.data;
    if (!data?.Name || !data?.Історія) continue;

    // Пропускаємо приймальників для цієї статистики
    if (data.Доступ === "Приймальник") continue;

    let actsCount = 0;
    let totalEarned = 0;
    let totalSalary = 0;

    const history = data.Історія;
    for (const dateKey of Object.keys(history)) {
      const entries = history[dateKey];
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        actsCount++;
        totalEarned += entry.СуммаРоботи || 0;

        if (entry.Записи) {
          for (const rec of entry.Записи) {
            totalSalary += rec.Зарплата || 0;
          }
        }
      }
    }

    if (actsCount === 0) continue;

    stats.push({
      name: data.Name,
      actsCount,
      totalEarned,
      totalSalary,
      avgPerAct: Math.round(totalEarned / actsCount),
    });
  }

  return stats.sort((a, b) => b.totalEarned - a.totalEarned);
}

/** Аномалії */
function detectAnomalies(): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // 1. Акти без зарплати (закриті, але зарплата = 0)
  for (const act of cachedActs) {
    if (!act.date_off) continue;
    const data = act.data;
    if (!data) continue;
    const workRev = data["За роботу"] || 0;
    if (workRev > 0) {
      const hasWorks = data.Роботи && data.Роботи.length > 0;
      const totalSalary = (data.Роботи || []).reduce(
        (sum, w) => sum + (w.Зарплата || 0),
        0,
      );
      if (hasWorks && totalSalary === 0) {
        anomalies.push({
          type: "warning",
          icon: "⚠️",
          message: `Акт #${act.act_id}: сума роботи ${formatMoney(workRev)} грн, але зарплата = 0`,
        });
      }
    }
  }

  // 2. Акти з нульовою сумою (закриті)
  for (const act of cachedActs) {
    if (!act.date_off) continue;
    const data = act.data;
    if (!data) continue;
    const total = (data["За роботу"] || 0) + (data["За деталі"] || 0);
    if (total === 0) {
      anomalies.push({
        type: "danger",
        icon: "🔴",
        message: `Акт #${act.act_id}: закритий з нульовою сумою`,
      });
    }
  }

  // 3. Відкриті акти старше 30 днів
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  for (const act of cachedActs) {
    if (act.date_off) continue;
    if (!act.date_on) continue;
    const openDate = new Date(act.date_on);
    if (openDate < thirtyDaysAgo) {
      const days = Math.floor(
        (Date.now() - openDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      anomalies.push({
        type: "info",
        icon: "📋",
        message: `Акт #${act.act_id}: відкритий вже ${days} днів`,
      });
    }
  }

  // Обмежуємо до 20 аномалій
  return anomalies.slice(0, 20);
}

/** Прогноз (лінійна регресія на основі місячних даних) */
function calcForecast(monthlyData: MonthlyRevenue[]): {
  nextMonthLabel: string;
  forecastRevenue: number;
  forecastProfit: number;
  trend: "up" | "down" | "stable";
} {
  const monthNames = [
    "Січ",
    "Лют",
    "Бер",
    "Кві",
    "Тра",
    "Чер",
    "Лип",
    "Сер",
    "Вер",
    "Жов",
    "Лис",
    "Гру",
  ];

  // Наступний місяць
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthLabel = `${monthNames[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`;

  if (monthlyData.length < 3) {
    return {
      nextMonthLabel,
      forecastRevenue: 0,
      forecastProfit: 0,
      trend: "stable",
    };
  }

  // Лінійна регресія
  const n = monthlyData.length;
  const revenues = monthlyData.map((m) => m.revenue);
  const profits = monthlyData.map((m) => m.profit);

  const xMean = (n - 1) / 2;
  const yMeanRev = revenues.reduce((s, v) => s + v, 0) / n;
  const yMeanProf = profits.reduce((s, v) => s + v, 0) / n;

  let numRev = 0,
    numProf = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    numRev += dx * (revenues[i] - yMeanRev);
    numProf += dx * (profits[i] - yMeanProf);
    den += dx * dx;
  }

  const slopeRev = den !== 0 ? numRev / den : 0;
  const slopeProf = den !== 0 ? numProf / den : 0;
  const forecastRevenue = Math.max(
    0,
    Math.round(yMeanRev + slopeRev * (n - xMean)),
  );
  const forecastProfit = Math.round(yMeanProf + slopeProf * (n - xMean));

  // Визначаємо тренд за останні 3 місяці
  const last3 = revenues.slice(-3);
  const trend: "up" | "down" | "stable" =
    last3[2] > last3[0] * 1.05
      ? "up"
      : last3[2] < last3[0] * 0.95
        ? "down"
        : "stable";

  return { nextMonthLabel, forecastRevenue, forecastProfit, trend };
}

// ===================== РЕНДЕРИНГ ГРАФІКІВ =====================

function renderRevenueChart(data: MonthlyRevenue[]): void {
  const el = document.getElementById("analityka-revenue-chart");
  if (!el) return;

  if (revenueChart) {
    revenueChart.destroy();
    revenueChart = null;
  }

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "area",
      height: 320,
      fontFamily: "Arial, sans-serif",
      toolbar: {
        show: true,
        tools: { download: true, zoom: true, pan: false, reset: true },
      },
      animations: { enabled: true, speed: 600 },
    },
    series: [
      { name: "Дохід", data: data.map((m) => m.revenue) },
      { name: "Витрати", data: data.map((m) => m.expenses) },
      { name: "Прибуток", data: data.map((m) => m.profit) },
    ],
    xaxis: {
      categories: data.map((m) => m.label),
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => formatMoney(val),
        style: { fontSize: "11px" },
      },
    },
    colors: ["#4caf50", "#f44336", "#2196f3"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.05,
        stops: [0, 100],
      },
    },
    stroke: { curve: "smooth", width: 2 },
    tooltip: {
      y: { formatter: (val: number) => `${formatMoney(val)} грн` },
    },
    legend: { position: "top" },
    dataLabels: { enabled: false },
  };

  revenueChart = new ApexCharts(el, options);
  revenueChart.render();
}

function renderTopWorksChart(data: TopWork[]): void {
  const el = document.getElementById("analityka-top-works-chart");
  if (!el) return;

  if (topWorksChart) {
    topWorksChart.destroy();
    topWorksChart = null;
  }

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      height: 320,
      fontFamily: "Arial, sans-serif",
      toolbar: { show: false },
      animations: { enabled: true, speed: 600 },
    },
    series: [{ name: "Дохід", data: data.map((w) => w.totalRevenue) }],
    xaxis: {
      categories: data.map((w) => truncateText(w.name, 25)),
      labels: {
        style: { fontSize: "10px" },
        rotate: -45,
        rotateAlways: data.length > 5,
      },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => formatMoney(val),
        style: { fontSize: "11px" },
      },
    },
    colors: ["#667eea"],
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: "60%",
        distributed: true,
      },
    },
    tooltip: {
      y: { formatter: (val: number) => `${formatMoney(val)} грн` },
      x: {
        formatter: (_val: number, opts: { dataPointIndex: number }) => {
          const idx = opts.dataPointIndex;
          return `${data[idx].name} (×${data[idx].count})`;
        },
      },
    },
    legend: { show: false },
    dataLabels: { enabled: false },
  };

  topWorksChart = new ApexCharts(el, options);
  topWorksChart.render();
}

function renderMechanicsChart(data: MechanicStats[]): void {
  const el = document.getElementById("analityka-mechanics-chart");
  if (!el) return;

  if (mechanicsChart) {
    mechanicsChart.destroy();
    mechanicsChart = null;
  }

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      height: 320,
      fontFamily: "Arial, sans-serif",
      toolbar: { show: false },
      stacked: false,
    },
    series: [
      { name: "Заробив для СТО", data: data.map((m) => m.totalEarned) },
      { name: "Зарплата", data: data.map((m) => m.totalSalary) },
    ],
    xaxis: {
      categories: data.map((m) => m.name),
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => formatMoney(val),
        style: { fontSize: "11px" },
      },
    },
    colors: ["#4caf50", "#ff9800"],
    plotOptions: {
      bar: { borderRadius: 4, columnWidth: "50%" },
    },
    tooltip: {
      shared: true,
      intersect: false,
      y: { formatter: (val: number) => `${formatMoney(val)} грн` },
    },
    legend: { position: "top" },
    dataLabels: { enabled: false },
  };

  mechanicsChart = new ApexCharts(el, options);
  mechanicsChart.render();
}

// ===================== РЕНДЕРИНГ КАРТОК =====================

function renderSummaryCards(
  monthly: MonthlyRevenue[],
  forecast: ReturnType<typeof calcForecast>,
): void {
  const container = document.getElementById("analityka-summary-cards");
  if (!container) return;

  // Поточний місяць
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = monthly.find((m) => m.month === currentKey);
  const prevKey = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
  const prevMonth = monthly.find((m) => m.month === prevKey);

  const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const totalActs = cachedActs.length;
  const openActs = cachedActs.filter((a) => !a.date_off).length;
  const closedActs = cachedActs.filter((a) => !!a.date_off);

  // Середній чек (по закритих актах)
  const avgCheck =
    closedActs.length > 0
      ? Math.round(
          closedActs.reduce((sum, a) => {
            const d = a.data;
            return (
              sum + (d ? (d["За роботу"] || 0) + (d["За деталі"] || 0) : 0)
            );
          }, 0) / closedActs.length,
        )
      : 0;

  // Найдорожчий акт
  let maxAct = { id: 0, total: 0 };
  for (const a of closedActs) {
    const d = a.data;
    const total = d ? (d["За роботу"] || 0) + (d["За деталі"] || 0) : 0;
    if (total > maxAct.total) maxAct = { id: a.act_id, total };
  }

  // Клієнтів обслуговано (унікальні client_id в актах)
  const uniqueClients = new Set(
    cachedActs.map((a) => a.client_id).filter(Boolean),
  );

  // Середній час закриття акту (днів)
  let avgDays = 0;
  const closedWithDates = closedActs.filter((a) => a.date_on && a.date_off);
  if (closedWithDates.length > 0) {
    const totalDays = closedWithDates.reduce((sum, a) => {
      const diff =
        new Date(a.date_off!).getTime() - new Date(a.date_on!).getTime();
      return sum + Math.max(0, diff / (1000 * 60 * 60 * 24));
    }, 0);
    avgDays = Math.round((totalDays / closedWithDates.length) * 10) / 10;
  }

  const trendIcon =
    forecast.trend === "up" ? "📈" : forecast.trend === "down" ? "📉" : "➡️";
  const trendColor =
    forecast.trend === "up"
      ? "#4caf50"
      : forecast.trend === "down"
        ? "#f44336"
        : "#ff9800";

  // Порівняння з минулим місяцем
  let changePercent = "";
  if (currentMonth && prevMonth && prevMonth.revenue > 0) {
    const pct = Math.round(
      ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100,
    );
    const sign = pct >= 0 ? "+" : "";
    changePercent = `<span style="color: ${pct >= 0 ? "#4caf50" : "#f44336"}; font-size: 13px;">${sign}${pct}% від мин. місяця</span>`;
  }

  container.innerHTML = `
    <div class="analityka-card">
      <div class="analityka-card-icon">💰</div>
      <div class="analityka-card-body">
        <div class="analityka-card-label">Дохід цього місяця</div>
        <div class="analityka-card-value">${formatMoney(currentMonth?.revenue || 0)} грн</div>
        ${changePercent}
      </div>
    </div>
    <div class="analityka-card">
      <div class="analityka-card-icon">🧾</div>
      <div class="analityka-card-body">
        <div class="analityka-card-label">Середній чек</div>
        <div class="analityka-card-value">${formatMoney(avgCheck)} грн</div>
        <span style="color: #666; font-size: 12px;">з ${closedActs.length} закритих актів</span>
      </div>
    </div>
    <div class="analityka-card">
      <div class="analityka-card-icon">📋</div>
      <div class="analityka-card-body">
        <div class="analityka-card-label">Актів / відкритих</div>
        <div class="analityka-card-value">${totalActs} / <span style="color:#f44336">${openActs}</span></div>
        <span style="color: #666; font-size: 12px;">⏱️ Сер. закриття: ${avgDays} дн.</span>
      </div>
    </div>
    <div class="analityka-card">
      <div class="analityka-card-icon">👥</div>
      <div class="analityka-card-body">
        <div class="analityka-card-label">Клієнтів обслуговано</div>
        <div class="analityka-card-value">${uniqueClients.size}</div>
      </div>
    </div>
    <div class="analityka-card">
      <div class="analityka-card-icon">📊</div>
      <div class="analityka-card-body">
        <div class="analityka-card-label">Дохід за ${monthly.length} міс.</div>
        <div class="analityka-card-value">${formatMoney(totalRevenue)} грн</div>
      </div>
    </div>
    <div class="analityka-card">
      <div class="analityka-card-icon">🏆</div>
      <div class="analityka-card-body">
        <div class="analityka-card-label">Найдорожчий акт</div>
        <div class="analityka-card-value">#${maxAct.id} — ${formatMoney(maxAct.total)} грн</div>
      </div>
    </div>
    <div class="analityka-card" style="border-left: 3px solid ${trendColor}">
      <div class="analityka-card-icon">${trendIcon}</div>
      <div class="analityka-card-body">
        <div class="analityka-card-label">Прогноз: ${forecast.nextMonthLabel}</div>
        <div class="analityka-card-value">${formatMoney(forecast.forecastRevenue)} грн</div>
        <span style="color: #666; font-size: 12px;">Прибуток: ~${formatMoney(forecast.forecastProfit)} грн</span>
      </div>
    </div>
  `;
}

function renderAnomalies(anomalies: Anomaly[]): void {
  const container = document.getElementById("analityka-anomalies");
  if (!container) return;

  if (anomalies.length === 0) {
    container.innerHTML = `<div class="analityka-anomaly-empty">✅ Аномалій не виявлено</div>`;
    return;
  }

  container.innerHTML = anomalies
    .map((a) => {
      const cls = `analityka-anomaly-item analityka-anomaly-${a.type}`;
      return `<div class="${cls}">${a.icon} ${a.message}</div>`;
    })
    .join("");
}

function renderMechanicsTable(data: MechanicStats[]): void {
  const container = document.getElementById("analityka-mechanics-table");
  if (!container) return;

  if (data.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">Немає даних</div>`;
    return;
  }

  const rows = data
    .map(
      (m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${m.name}</strong></td>
      <td>${m.actsCount}</td>
      <td>${formatMoney(m.totalEarned)} грн</td>
      <td>${formatMoney(m.totalSalary)} грн</td>
      <td>${formatMoney(m.avgPerAct)} грн</td>
    </tr>
  `,
    )
    .join("");

  container.innerHTML = `
    <table class="analityka-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Механік</th>
          <th>Актів</th>
          <th>Заробив для СТО</th>
          <th>Зарплата</th>
          <th>Сер. за акт</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ===================== УТИЛІТИ =====================

function formatMoney(val: number): string {
  return Math.round(val)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// ===================== ГОЛОВНА ФУНКЦІЯ =====================

/** Ініціалізувати та відобразити аналітику */
export async function initAnalityka(): Promise<void> {
  if (isLoading) return;
  isLoading = true;

  const container = document.getElementById("analityka-dashboard");
  if (!container) {
    isLoading = false;
    return;
  }

  // Показуємо лоадер
  container.innerHTML = `
    <div class="analityka-loader">
      <div class="analityka-spinner"></div>
      <span>Завантаження аналітики...</span>
    </div>
  `;

  const ok = await loadAnalyticsData();
  if (!ok) {
    container.innerHTML = `<div style="text-align:center; color:#f44336; padding:40px;">❌ Помилка завантаження даних</div>`;
    isLoading = false;
    return;
  }

  // Обчислення
  const monthlyData = calcMonthlyRevenue();
  const topWorks = calcTopWorks();
  const mechanicStats = calcMechanicStats();
  const anomalies = detectAnomalies();
  const forecast = calcForecast(monthlyData);

  // Рендеримо структуру
  container.innerHTML = `
    <!-- Картки -->
    <div id="analityka-summary-cards" class="analityka-summary-cards"></div>

    <!-- Графік доходу по місяцях -->
    <div class="analityka-chart-block">
      <h3 class="analityka-chart-title">📈 Дохід / Витрати / Прибуток по місяцях</h3>
      <div id="analityka-revenue-chart"></div>
    </div>

    <!-- Два блока: Топ робіт + Механіки -->
    <div class="analityka-row">
      <div class="analityka-chart-block analityka-half">
        <h3 class="analityka-chart-title">🏆 Топ-10 найприбутковіших робіт</h3>
        <div id="analityka-top-works-chart"></div>
      </div>
      <div class="analityka-chart-block analityka-half">
        <h3 class="analityka-chart-title">👨‍🔧 Ефективність механіків</h3>
        <div id="analityka-mechanics-chart"></div>
      </div>
    </div>

    <!-- Таблиця механіків -->
    <div class="analityka-chart-block">
      <h3 class="analityka-chart-title">📊 Детальна статистика механіків</h3>
      <div id="analityka-mechanics-table"></div>
    </div>

    <!-- Аномалії -->
    <div class="analityka-chart-block">
      <h3 class="analityka-chart-title">⚠️ Аномалії та попередження</h3>
      <div id="analityka-anomalies" class="analityka-anomalies"></div>
    </div>
  `;

  // Рендеримо компоненти
  renderSummaryCards(monthlyData, forecast);
  renderRevenueChart(monthlyData);
  renderTopWorksChart(topWorks);
  renderMechanicsChart(mechanicStats);
  renderMechanicsTable(mechanicStats);
  renderAnomalies(anomalies);

  isLoading = false;
}

/** Оновити дані аналітики */
export async function refreshAnalityka(): Promise<void> {
  // Знищуємо старі графіки
  if (revenueChart) {
    revenueChart.destroy();
    revenueChart = null;
  }
  if (topWorksChart) {
    topWorksChart.destroy();
    topWorksChart = null;
  }
  if (mechanicsChart) {
    mechanicsChart.destroy();
    mechanicsChart = null;
  }

  await initAnalityka();
}
