const state = {
  view: "diagnostic",
  diagnosticTab: 0,
  data: null,
  coyuntura: {
    filters: {
      indicador: "",
      segmento: "",
      fuente: "",
      nivel: "",
    },
    sortKey: "periodo",
    sortDir: "desc",
  },
};

const palette = ["#ff246d", "#7432c4", "#23845a", "#ff7a18", "#3066fe", "#14b8a6"];
const el = (id) => document.getElementById(id);

function clean(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function normalize(text) {
  return clean(text).toLowerCase();
}

function valueFromRow(row) {
  return row.filter(Boolean).slice(1, 4).map(clean);
}

function pickMetricRows(rows, limit = 3) {
  return rows.filter((r) => clean(r[0]) && !["Bloque del CM", "Bloque"].includes(clean(r[0]))).slice(0, limit);
}

function countIndicators(block) {
  return block.rows.filter((row) => {
    const label = clean(row[0]);
    return label && !/^(Bloque del CM|Bloque)$/.test(label);
  }).length;
}

function sourceCounts(blocks) {
  const counts = new Map();
  for (const block of blocks) {
    for (const row of block.rows) {
      const src = clean(row[3] || row[5] || row[6] || row[7] || "Sin fuente");
      if (!src || /^Bloque/.test(clean(row[0]))) continue;
      counts.set(src, (counts.get(src) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function sourceList(blocks) {
  const sources = new Set();
  for (const block of blocks) {
    for (const row of block.rows) {
      const src = clean(row[3] || row[5] || row[6] || row[7] || "");
      if (!src || /^Bloque/.test(clean(row[0]))) continue;
      src.split(/\s*\/\s*|\s*-\s*/).forEach((part) => {
        const value = clean(part);
        if (value) sources.add(value);
      });
    }
  }
  return [...sources];
}

function getDiagnosticResourceData() {
  return Array.isArray(window.DIAG_RESOURCE_JSON) ? window.DIAG_RESOURCE_JSON : [];
}

function stripLangSuffix(value) {
  return clean(String(value ?? "")).replace(/\s*@(?:es|en)\b/gi, "").replace(/\s+/g, " ").trim();
}

function getResourceName(resource) {
  const names = Array.isArray(resource?.name) ? resource.name : [];
  return stripLangSuffix(names.find((name) => /@es\b/i.test(String(name))) || names[0] || resource?.uri || "Recurso");
}

function getResourceType(resource) {
  const raw = Array.isArray(resource?.type) ? resource.type.find((value) => clean(value)) : resource?.type;
  return stripLangSuffix(String(raw ?? "").split("#").pop() || raw || "Sin tipo");
}

function getResourceLocation(resource) {
  const loc = Array.isArray(resource?.hasLocation) ? resource.hasLocation[0] : null;
  if (!loc) return null;
  const lat = Number((Array.isArray(loc.latitude) ? loc.latitude[0] : loc.latitude) ?? NaN);
  const lng = Number((Array.isArray(loc.longitude) ? loc.longitude[0] : loc.longitude) ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    municipality: stripLangSuffix(Array.isArray(loc.municipality) ? loc.municipality[0] : loc.municipality),
  };
}

function getResourceKeywords(resource) {
  const desc = Array.isArray(resource?.hasDescription) ? resource.hasDescription : [];
  return desc.flatMap((item) => Array.isArray(item.keyword) ? item.keyword : []).map(stripLangSuffix).filter(Boolean);
}

function resourceCategory(type, keywords = []) {
  const kw = keywords.join(" ").toLowerCase();
  const t = clean(type).toLowerCase();
  if (/winery|enoteca/.test(t)) return "Bodegas";
  if (/museum|culturecentre|touristattractionsite|church|monument/.test(t) || /flamenco|monumental/.test(kw)) return "Cultura";
  if (/hotel|aparthotel|ruralhouse/.test(t) || /hoteles del vino|alojamiento/.test(kw)) return "Alojamiento";
  if (/restaurant|cafeorcoffeeshop|cateringservice|pub/.test(t) || /gastronom/.test(kw)) return "Restauración";
  if (/event|tour/.test(t) || /evento/.test(kw)) return "Eventos";
  if (/naturalpark|naturalresource/.test(t) || /naturaleza|espacios naturales/.test(kw)) return "Naturaleza";
  if (/travelagency/.test(t) || /agencias de viajes/.test(kw)) return "Agencias";
  return "Otros";
}

function buildDiagnosticResourceStats() {
  const items = getDiagnosticResourceData().map((resource) => {
    const type = getResourceType(resource);
    const keywords = getResourceKeywords(resource);
    const location = getResourceLocation(resource);
    return {
      name: getResourceName(resource),
      type,
      keywords,
      location,
      hasDescription: Boolean(Array.isArray(resource?.hasDescription) && resource.hasDescription.length),
      hasContact: Boolean(Array.isArray(resource?.hasContactPoint) && resource.hasContactPoint.length),
      hasMedia: Boolean(Array.isArray(resource?.hasMultimedia) && resource.hasMultimedia.length && resource.hasMultimedia[0]?.mainImage?.[0] && resource.hasMultimedia[0].mainImage[0] !== "-"),
      category: resourceCategory(type, keywords),
    };
  });
  const geolocated = items.filter((item) => item.location);
  const byCategory = [...new Map(items.map((item) => item.category).filter(Boolean).map((cat, idx, arr) => [cat, {
    category: cat,
    count: items.filter((item) => item.category === cat).length,
    locCount: items.filter((item) => item.category === cat && item.location).length,
    color: palette[arr.indexOf(cat) % palette.length],
  }]))].map(([, value]) => value).sort((a, b) => b.count - a.count);
  const byType = Object.values(items.reduce((acc, item) => {
    const key = item.type || "Sin tipo";
    acc[key] = acc[key] || { type: key, count: 0, locCount: 0 };
    acc[key].count += 1;
    acc[key].locCount += item.location ? 1 : 0;
    return acc;
  }, {})).sort((a, b) => b.count - a.count);
  return {
    items,
    geolocated,
    coverage: {
      location: geolocated.length,
      description: items.filter((item) => item.hasDescription).length,
      contact: items.filter((item) => item.hasContact).length,
      media: items.filter((item) => item.hasMedia).length,
    },
    byCategory,
    byType,
  };
}

function summaryCards(view) {
  if (view === "s15") {
    const d = window.S15_RESULTS?.diagnostic;
    const c = window.S15_RESULTS?.city;
    const cards = [
      ["Muestra", d?.sample_size ?? "N/D", "Respuestas de diagnóstico"],
      ["Satisfacción", d ? `${d.avg_satisfaction}/5` : "N/D", "Media global"],
      ["Apoyo local", c ? `${c.support_pct}%` : "N/D", "Ciudadanía a favor"],
      ["Impacto positivo", c ? `${c.positive_impact_pct}%` : "N/D", "Percepción del entorno"],
    ];
    return cards
      .map(
        ([label, value, note], i) => `
          <article class="kpi">
            <div class="kpi-icon ${i % 2 === 0 ? "pink" : "purple"}">${i + 1}</div>
            <div>
              <h3>${label}</h3>
              <div class="kpi-value">${value}</div>
              <small>${note}</small>
            </div>
          </article>`
      )
      .join("");
  }
  const blocks = state.data[view].blocks;
  const indicators = blocks.reduce((acc, b) => acc + countIndicators(b), 0);
  const sources = sourceList(blocks);
  const sourceText = sources.length ? sources.join(" / ") : "N/D";
  const cards = view === "diagnostic"
    ? [
        ["Bloques", "10", "Estructura completa del diagnóstico"],
        ["Indicadores", String(indicators), "Indicadores y filas descriptivas"],
        ["Fuentes de información", sourceText, `${sources.length} fuentes distintas`],
        ["Lectura", "Base", "Situación sin acción"],
      ]
    : [
        ["Bloques", "7", "Estructura completa del resultado simulado"],
        ["Indicadores", String(indicators), "Indicadores con ejemplo"],
        ["Fuentes de información", sourceText, `${sources.length} fuentes distintas`],
        ["Lectura", "Efecto", "Situación con acción simulada"],
      ];

  return cards
    .map(
      ([label, value, note], i) => `
        <article class="kpi">
          <div class="kpi-icon ${i % 2 === 0 ? "pink" : "purple"}">${i + 1}</div>
          <div>
            <h3>${label}</h3>
            <div class="kpi-value ${label === "Fuentes de información" ? "kpi-value--source" : ""}">${value}</div>
            <small>${note}</small>
          </div>
        </article>`
    )
    .join("");
}

function makeMiniBars(rows) {
  const lengths = rows.map((r) => {
    const raw = [r[1], r[2], r[3], r[4], r[5], r[6], r[7]].join(" ");
    const digits = (raw.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(String(n).replace(",", ".")));
    return digits.reduce((a, b) => a + b, 0) || Math.max(1, raw.length / 20);
  });
  const max = Math.max(...lengths, 1);
  return lengths
    .map((v, idx) => `<div class="mini-bar"><span style="width:${Math.max(12, (v / max) * 100)}%;background:${palette[idx % palette.length]}"></span></div>`)
    .join("");
}

function chartTypeFor(view, idx) {
  const seq = view === "s15" ? ["donut", "bars", "hist", "bars"] : ["donut", "bars", "hist", "bars", "donut", "hist", "bars", "bars", "donut", "bars"];
  return seq[idx % seq.length];
}

function renderDonut(count, total, color = "#ff246d", label = "") {
  const pct = total ? Math.max(0, Math.min(100, (count / total) * 100)) : 0;
  return `
    <div class="donut-shell">
      <div class="donut" style="background:conic-gradient(${color} 0 ${pct}%, #ebedf3 ${pct}% 100%)">
        <span></span>
      </div>
      <div class="donut-meta">
        <strong>${count}</strong>
        <small>${label}</small>
      </div>
    </div>`;
}

function renderHistogram(rows, color = "#7432c4") {
  const bars = rows.map((r) => {
    const text = [r[0], r[1], r[2], r[3]].join(" ");
    const score = Math.max(12, Math.min(100, text.length * 2));
    return `<div class="hist-bar" title="${clean(r[0])}"><i style="height:${score}%;background:${color}"></i></div>`;
  }).join("");
  return `<div class="histogram">${bars}</div>`;
}

function renderMapCard(title, note) {
  return `
    <div class="map-wrap">
      <div class="leaflet-map" data-map="jerez-map"></div>
      <p class="map-note">${note}</p>
    </div>`;
}

function renderResourceMap(block) {
  const items = block.rows
    .filter((row) => clean(row[0]) && !/^Bloque/.test(clean(row[0])))
    .slice(0, 6)
    .map((row, idx) => ({
      label: clean(row[0]),
      coords: [
        [36.6868, -6.1388],
        [36.6902, -6.1295],
        [36.6798, -6.1248],
        [36.6844, -6.1492],
        [36.6982, -6.1142],
        [36.6724, -6.1411],
      ][idx],
    }));
  const points = items
    .map(
      (item) => `
      <div class="resource-point">
        <b>${item.label}</b>
        <small>Marcador geográfico orientativo en Jerez</small>
      </div>`
    )
    .join("");
  return `
    <div class="map-wrap">
      <div class="leaflet-map" data-map="resources-map"></div>
      <div class="resource-legend">${points}</div>
      <p class="map-note">Mapa base de recursos S2. Cuando estén las coordenadas reales, sustituiremos estos puntos orientativos por los georreferenciados.</p>
    </div>`;
}

function renderBlock(block, view) {
  const rows = pickMetricRows(block.rows, view === "diagnostic" ? 3 : 4);
  const type = chartTypeFor(view, state.data[view].blocks.indexOf(block));
  let chart = "";
  if (view === "diagnostic" && block.title === "1. OFERTA ENOTURISTICA") {
    chart = renderResourceMap(block);
  } else if (type === "donut") chart = renderDonut(rows.length, Math.max(1, countIndicators(block)), palette[state.data[view].blocks.indexOf(block) % palette.length], "Indicadores visibles");
  else if (type === "hist") chart = renderHistogram(rows, palette[state.data[view].blocks.indexOf(block) % palette.length]);
  else chart = `<div class="block-chart">${makeMiniBars(rows)}</div>`;
  return `
    <article class="panel block-card">
      <div class="block-head">
        <div>
          <h3>${block.title}</h3>
          <p>${rows.length} indicadores visibles</p>
        </div>
        <span class="block-badge">${countIndicators(block)}</span>
      </div>
      ${type === "donut" ? chart : type === "hist" ? chart : chart}
      <div class="block-table">
        ${rows
          .map(
            (row) => `
            <div class="row-item">
              <b>${clean(row[0])}</b>
              <span>${valueFromRow(row).join(" · ")}</span>
            </div>`
          )
          .join("")}
      </div>
    </article>`;
}

function renderDiagnosticTabs() {
  const blocks = state.data.diagnostic.blocks;
  const shortLabels = [
    "Oferta",
    "Perfil",
    "Digital",
    "Promoción",
    "Comportamiento",
    "Satisfacción",
    "Reputación",
    "Residentes",
    "Coyuntura",
    "Medioamb.",
  ];
  return `
    <div class="diag-tabs">
      ${blocks
        .slice(0, 8)
        .map(
          (block, idx) => `
            <button type="button" class="${idx === state.diagnosticTab ? "active" : ""}" data-diag-tab="${idx}">
              <b>${shortLabels[idx] || block.title}</b>
              <div class="diag-tabs__meta">
                <span>${idx + 1}</span>
                <small>${countIndicators(block)} indicadores</small>
              </div>
            </button>`
        )
        .join("")}
      <button type="button" class="${state.diagnosticTab === "coyuntura" ? "active" : ""}" data-diag-tab="coyuntura">
        <b>${shortLabels[8]}</b>
        <div class="diag-tabs__meta">
          <span>9</span>
          <small>5 indicadores</small>
        </div>
      </button>
      <button type="button" class="${state.diagnosticTab === "medioamb" ? "active" : ""}" data-diag-tab="medioamb">
        <b>${shortLabels[9]}</b>
        <div class="diag-tabs__meta">
          <span>10</span>
          <small>3 indicadores</small>
        </div>
      </button>
    </div>`;
}

function renderDiagnosticMap() {
  if (state.diagnosticTab !== 0) {
    const block = state.data.diagnostic.blocks[state.diagnosticTab];
    const rows = block.rows.filter((row) => clean(row[0]) && !/^Bloque/.test(clean(row[0]))).slice(0, 6);
    const summary = rows
      .map((row) => `<li><span>${clean(row[0])}</span><small>${valueFromRow(row).join(" · ")}</small></li>`)
      .join("");
    return `
      <section class="panel diag-map-panel">
        <div class="topic-heading">
          <div>
            <small>VISOR DE MAPAS</small>
            <h2>${block.title}</h2>
            <p>${clean(rows[0]?.[1] || "")}</p>
          </div>
        </div>
        <div class="diag-map-grid">
          <div class="leaflet-map" data-map="diag-main-map"></div>
          <div class="diag-side">
            <div class="diag-side-card">
              <h3>Capas / indicadores</h3>
              <ul class="diag-layer-list">${summary}</ul>
            </div>
          </div>
        </div>
      </section>`;
  }
  const block = state.data.diagnostic.blocks[0];
  const stats = buildDiagnosticResourceStats();
  const layers = stats.byCategory.length ? stats.byCategory : [{ category: "Sin datos", count: 0, locCount: 0, color: palette[0] }];
  const keyLayers = [
    { label: "Nº de bodegas abiertas al enoturismo", value: stats.items.filter((item) => /winery/i.test(item.type)).length, note: "Bodegas geolocalizadas en el JSON" },
    { label: "Nº de museos y centros de interpretación", value: stats.items.filter((item) => item.category === "Cultura").length, note: "Cultura, patrimonio y centros afines" },
    { label: "Nº de instalaciones con reserva online", value: stats.coverage.contact, note: "Recursos con canal de contacto publicado" },
    { label: "% de alojamientos con paquete enoturístico", value: Math.round((stats.items.filter((item) => item.category === "Alojamiento").length / Math.max(1, stats.geolocated.length)) * 100), note: "Proxy sobre la oferta geolocalizada" },
  ];
  const coverageLegend = [
    { label: "Con ubicación", value: stats.coverage.location, color: palette[0] },
    { label: "Con descripción", value: stats.coverage.description, color: palette[1] },
    { label: "Con contacto", value: stats.coverage.contact, color: palette[2] },
    { label: "Con imagen", value: stats.coverage.media, color: palette[3] },
  ];
  const topCards = [
    { label: "Recursos", value: String(stats.items.length), note: "Total del JSON" },
    { label: "Geolocalizados", value: String(stats.geolocated.length), note: "Con coordenadas" },
    { label: "Categorías", value: String(stats.byCategory.length), note: "Capas temáticas" },
    { label: "Cobertura", value: `${Math.round((stats.coverage.location / Math.max(1, stats.items.length)) * 100)}%`, note: "Recursos con ubicación" },
  ];
  return `
    <section class="panel diag-map-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE MAPAS</small>
          <h2>${block.title}</h2>
          <p>Capas y tarjetas generadas desde el JSON de recursos geolocalizados</p>
        </div>
      </div>
      <div class="diag-top-kpis">
        ${topCards.map((card, idx) => `
          <article class="diag-top-kpi">
            <div class="diag-top-kpi__icon" style="background:${palette[idx % palette.length]}"></div>
            <div>
              <strong>${card.value}</strong>
              <span>${card.label}</span>
              <small>${card.note}</small>
            </div>
          </article>`).join("")}
      </div>
      <div class="diag-map-layout">
        <div class="diag-map-panel-main">
          <div class="diag-map-toolbar">
            ${layers.map((layer) => `<button type="button" class="diag-layer-chip active" data-resource-layer="${layer.category}" style="--swatch:${layer.color}"><i></i>${layer.category} · ${layer.count}</button>`).join("")}
          </div>
          <div class="diag-map-wrap">
            <div class="leaflet-map" data-map="diag-main-map"></div>
            <p class="diag-map-note">Las capas se pintan con los recursos del JSON y se pueden activar o desactivar.</p>
          </div>
        </div>
        <aside class="diag-map-sidebar">
          <article class="diag-side-card">
            <h3>Capas / indicadores</h3>
            <div class="diag-side-mini">
              ${keyLayers.map((layer) => `<div class="diag-side-mini__item"><b>${layer.label}</b><small>${layer.value} · ${layer.note}</small></div>`).join("")}
            </div>
          </article>
          <article class="diag-side-card">
            <h3>Cobertura del dato</h3>
            ${renderDonut(stats.coverage.location, stats.items.length, palette[1], "Con ubicación")}
            <div class="diag-chart-legend">
              ${coverageLegend.map((item) => `<div><i style="background:${item.color}"></i><span>${item.label}</span><small>${item.value}</small></div>`).join("")}
            </div>
          </article>
        </aside>
      </div>
    </section>`;
}

function renderDiagnosticProfileCards() {
  const dataRows = window.SIM_DIAG_TURISTA?.rows || [];
  const block = state.data.diagnostic.blocks[1];
  const cleanText = (value) => clean(String(value ?? "").replace(/�/g, "ó"));
  const fieldByPrefix = (prefix) => (window.SIM_DIAG_TURISTA?.headers || []).find((h) => cleanText(h).startsWith(prefix)) || prefix;
  const rows = Array.isArray(dataRows) && dataRows.length ? dataRows : [];
  const total = Math.max(1, rows.length);
  const counts = (field) => {
    const counter = new Map();
    rows.forEach((row) => {
      const value = cleanText(row[field]);
      if (!value) return;
      counter.set(value, (counter.get(value) || 0) + 1);
    });
    return [...counter.entries()].sort((a, b) => b[1] - a[1]);
  };
  const share = (value) => Math.round((value / total) * 1000) / 10;
  const avgScore = (field) => {
    const nums = rows
      .map((row) => Number(String(row[field] ?? "").replace(",", ".")))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };
  const topList = (items, limit = 4) =>
    items.slice(0, limit).map(([label, value], idx) => ({ label, value, color: palette[idx % palette.length] }));
  const toPercentItems = (items) => {
    const totalValue = items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
    return items.map((item) => ({
      ...item,
      value: Math.round((Number(item.value || 0) / totalValue) * 1000) / 10,
    }));
  };
  const pctLegend = (items) => {
    const totalItems = items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
    return `<div class="diag-chart-legend">${items
      .map((item) => {
        const pct = Math.round((Number(item.value || 0) / totalItems) * 1000) / 10;
        return `<div><i style="background:${item.color}"></i><span>${item.label}</span><small>${pct}%</small></div>`;
      })
      .join("")}</div>`;
  };
  const donut = (items, center, unit = "%") => {
    const totalValue = items.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
    let acc = 0;
    const arcs = items
      .map((item) => {
        const start = (acc / totalValue) * 100;
        acc += Number(item.value || 0);
        const end = (acc / totalValue) * 100;
        return `${item.color} ${start}% ${end}%`;
      })
      .join(", ");
    return `
      <div class="diag-card-chart diag-card-chart--donut">
        <div class="diag-card-ring" style="background:conic-gradient(${arcs || `${palette[0]} 0 100%`})">
          <span>${center}</span>
        </div>
        ${pctLegend(items)}
      </div>`;
  };
  const bars = (items, note) => `
    <div class="diag-card-chart diag-card-chart--bars">
      <div class="diag-card-bars">
        ${items.map((item) => `<i style="height:${Math.max(20, Math.min(100, item.value))}%;background:${item.color}" title="${item.label}: ${item.value}"></i>`).join("")}
      </div>
      ${pctLegend(items)}
      <small>${note}</small>
    </div>`;
  const hist = (items, note) => `
    <div class="diag-card-chart diag-card-chart--hist">
      <div class="diag-card-hist">
        ${items.map((item) => `<span style="height:${Math.max(20, Math.min(100, item.value))}%;background:${item.color}" title="${item.label}: ${item.value}"></span>`).join("")}
      </div>
      ${pctLegend(items)}
      <small>${note}</small>
    </div>`;
  const mini = (items, note) => `
    <div class="diag-card-chart diag-card-chart--mini">
      <div class="diag-card-mini">
        ${items.map((item) => `<i style="width:${Math.max(30, Math.min(100, item.value))}%;background:${item.color}" title="${item.label}: ${item.value}"></i>`).join("")}
      </div>
      ${pctLegend(items)}
      <small>${note}</small>
    </div>`;
  const ageLabels = ["18-24", "25-34", "35-44", "45-54", "55-64", "65 o mas"];
  const ageMale = ageLabels.map((label) => {
    const ageCount = (counts("Q2 Edad").find(([k]) => k === label)?.[1] || 0);
    const sexCount = rows.filter((row) => cleanText(row["Q2 Edad"]) === label && cleanText(row["Q3 Sexo"]) === "Hombre").length;
    return { label, left: Math.round((sexCount / total) * 1000) / 10, right: Math.round(((ageCount - sexCount) / total) * 1000) / 10 };
  });
  const maleTotal = rows.filter((row) => cleanText(row["Q3 Sexo"]) === "Hombre").length;
  const femaleTotal = rows.filter((row) => cleanText(row["Q3 Sexo"]) === "Mujer").length;
  const procedencia = counts("Q1 Procedencia");
  const nacional = procedencia.filter(([label]) => /España/i.test(label));
  const extranjera = procedencia.filter(([label]) => !/España/i.test(label));
  const ccaa = procedencia.filter(([label]) => /España - /i.test(label)).map(([label, value]) => [label.replace("España - ", "").trim(), value]);
  const q18Field = fieldByPrefix("Q18 Satisfaccion global");
  const q22Field = fieldByPrefix("Q22 NPS");
  const q23Field = fieldByPrefix("Q23 Intencion de repetir");
  const q18 = avgScore(q18Field);
  const q22 = avgScore(q22Field);
  const q23 = counts(q23Field);
  const cards = [
    {
      title: "Procedencia nacional/extranjera",
      desc: "Peso de visitantes nacionales frente a extranjeros",
      foot: "Unidades: % de respuestas",
      chart: donut(
        toPercentItems(topList(
          [
            ["Nacional", nacional.reduce((a, b) => a + b[1], 0)],
            ["Extranjera", extranjera.reduce((a, b) => a + b[1], 0)],
          ],
          2
        )),
        `${share(nacional.reduce((a, b) => a + b[1], 0))}%`
      ),
      source: "Q1",
    },
    {
      title: "Procedencia por CCAA",
      desc: "Origen de los visitantes nacionales",
      foot: "Solo visitantes de España",
      chart: bars(toPercentItems(topList(ccaa, 5)), "Distribución territorial por CCAA"),
      source: "Q1",
    },
    {
      title: "Edad y sexo",
      desc: "Pirámide de población simulada",
      foot: `Hombres ${share(maleTotal)}% · Mujeres ${share(femaleTotal)}%`,
      chart: `
        <div class="diag-pyramid">
          <div class="diag-pyramid__chart">
            ${ageMale.map((item) => `
              <div class="diag-pyramid__row">
                <span class="diag-pyramid__label">${item.label}</span>
                <i class="left" style="width:${Math.max(6, item.left * 3)}%;background:${palette[0]}" title="${item.label} Hombres: ${item.left}%"></i>
                <i class="right" style="width:${Math.max(6, item.right * 3)}%;background:${palette[1]}" title="${item.label} Mujeres: ${item.right}%"></i>
              </div>`).join("")}
          </div>
          ${pctLegend([
            { label: "Hombres", value: share(maleTotal), color: palette[0] },
            { label: "Mujeres", value: share(femaleTotal), color: palette[1] },
          ])}
          <div class="diag-chart-note">Anchura proporcional a la muestra total. Lado izquierdo: hombres. Lado derecho: mujeres.</div>
        </div>`,
      source: "Q2 / Q3",
    },
    {
      title: "Nivel de ingresos",
      desc: "Capacidad de gasto declarada",
      foot: "Unidades: % de respuestas",
      chart: hist(toPercentItems(topList(counts("Q4 Nivel ingresos"), 4)), "Nivel socioeconómico"),
      source: "Q4",
    },
    {
      title: "Relación con el vino",
      desc: "Del aficionado al profesional",
      foot: "Turista experto vs iniciación",
      chart: donut(toPercentItems(topList(counts("Q5 Relacion con el vino"), 4)), `${share(counts("Q5 Relacion con el vino")[0]?.[1] || 0)}%`),
      source: "Q5",
    },
    {
      title: "Compañía de viaje",
      desc: "Pareja, amigos, familia o grupo",
      foot: "Formato de experiencia",
      chart: bars(toPercentItems(topList(counts(fieldByPrefix("Q6 Com")), 5)), "Tipos de compañía"),
      source: "Q6",
    },
    {
      title: "Duración de la estancia",
      desc: "Excursión, 1 noche o escapada larga",
      foot: "Producto de fin de semana",
      chart: hist(toPercentItems(topList(counts(fieldByPrefix("Q7 Noches en Jerez")), 4)), "Noches en Jerez"),
      source: "Q7",
    },
    {
      title: "Frecuencia de visita",
      desc: "Primera visita o repetición",
      foot: "Fidelidad turística",
      chart: donut(toPercentItems(topList(counts(fieldByPrefix("Q8 Frecuencia de visita")), 3)), `${share(counts(fieldByPrefix("Q8 Frecuencia de visita"))[0]?.[1] || 0)}%`),
      source: "Q8",
    },
    {
      title: "Satisfacción y recomendación",
      desc: "Satisfacción global, NPS e intención de repetir",
      foot: `${q18 ? `Satisfacción media ${q18.toFixed(1)}/5` : ""}${q18 && q22 ? " · " : ""}${q22 ? `NPS medio ${q22.toFixed(1)}` : ""}${q23.length ? ` · Repite: ${q23[0][0]}` : ""}`,
      chart: mini(
        [
          { label: "Satisfacción", value: Math.round((q18 || 0) / 5 * 100), color: palette[0] },
          { label: "NPS", value: Math.round((q22 || 0) / 10 * 100), color: palette[1] },
          { label: "Repetición", value: Math.round(((q23[0]?.[1] || 0) / Math.max(1, rows.length)) * 100), color: palette[2] },
        ],
        "Medias y predisposición"
      ),
      source: "Q18 / Q22 / Q23",
    },
  ];

  return `
    <section class="panel diag-map-panel diag-profile-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE TARJETAS</small>
          <h2>${block.title}</h2>
          <p>Datos simulados de la encuesta de diagnóstico del turista en Jerez</p>
        </div>
      </div>
      <div class="diag-profile-grid">
        ${cards
          .map((card, idx) => `
            <article class="diag-profile-card">
              <div class="diag-profile-card__head">
                <div class="diag-profile-card__badge">${idx + 1}</div>
                <div class="diag-profile-card__titles">
                  <h3>${card.title}</h3>
                  <p>${card.desc}</p>
                </div>
              </div>
              ${card.chart}
              <div class="diag-profile-card__foot">
                <span>${card.source}</span>
                <small>${card.foot}</small>
              </div>
            </article>`)
          .join("")}
      </div>
    </section>`;
}

function renderDiagnosticDigitalCards() {
  const block = state.data.diagnostic.blocks[2];
  const rows = block.rows.filter((row) => clean(row[0]) && !/^Bloque/.test(clean(row[0]))).slice(0, 4);
  const fieldByPrefix = (prefix) => (window.SIM_DIAG_TURISTA?.headers || []).find((h) => clean(String(h)).startsWith(prefix)) || prefix;
  const q15Field = fieldByPrefix("Q15 Medios de inspiracion");
  const q15Counts = (() => {
    const counter = new Map();
    (window.SIM_DIAG_TURISTA?.rows || []).forEach((row) => {
      const value = clean(String(row[q15Field] ?? ""));
      if (!value) return;
      value.split(/\s*\/\s*/).forEach((part) => {
        const key = clean(part);
        if (!key) return;
        counter.set(key, (counter.get(key) || 0) + 1);
      });
    });
    return [...counter.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const total = Math.max(1, (window.SIM_DIAG_TURISTA?.rows || []).length);
  const toPct = (n) => Math.round((n / total) * 1000) / 10;
  const digitalCards = [
    {
      title: "Medios de inspiración-preparación del viaje",
      desc: "Canales que ayudan a decidir y preparar la visita",
      source: "Q15 / S15",
      foot: "Distribución real de la encuesta simulada",
      chart: `
        <div class="diag-card-chart diag-card-chart--bars">
          <div class="diag-card-bars diag-card-bars--wide">
            ${q15Counts.slice(0, 4).map(([label, value], idx) => `<i style="height:${Math.max(20, (value / total) * 100)}%;background:${palette[idx % palette.length]}" title="${label}: ${toPct(value)}%"></i>`).join("")}
          </div>
          <div class="diag-chart-legend">
            ${q15Counts.slice(0, 4).map(([label, value], idx) => `<div><i style="background:${palette[idx % palette.length]}"></i><span>${label}</span><small>${toPct(value)}%</small></div>`).join("")}
          </div>
          <small>Basado en Q15 Medios de inspiracion</small>
        </div>`,
    },
    {
      title: "Recursos e instalaciones consultados",
      desc: "Bodegas y museos más buscados en Web/App/Asistente",
      source: "S3 / S4 / S8",
      foot: "Datos inventados coherentes",
      chart: `
        <div class="diag-card-chart diag-card-chart--donut">
          <div class="diag-card-ring" style="background:conic-gradient(${palette[0]} 0 40%, ${palette[1]} 40% 70%, ${palette[2]} 70% 100%)">
            <span>3</span>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Bodegas</span><small>40%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Museos</span><small>30%</small></div>
            <div><i style="background:${palette[2]}"></i><span>Centros</span><small>30%</small></div>
          </div>
          <small>Prioridad de recursos consultados</small>
        </div>`,
    },
    {
      title: "Tendencias de consulta sobre enoturismo",
      desc: "Evolución del interés digital en temporada baja",
      source: "S8",
      foot: "Serie simulada mensual",
      chart: `
        <div class="diag-card-chart diag-card-chart--hist">
          <div class="diag-card-hist">
            <span style="height:38%;background:${palette[0]}"></span>
            <span style="height:54%;background:${palette[1]}"></span>
            <span style="height:46%;background:${palette[2]}"></span>
            <span style="height:72%;background:${palette[3]}"></span>
            <span style="height:62%;background:${palette[4]}"></span>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Nov</span><small>38%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Dic</span><small>54%</small></div>
            <div><i style="background:${palette[2]}"></i><span>Ene</span><small>46%</small></div>
            <div><i style="background:${palette[3]}"></i><span>Feb</span><small>72%</small></div>
            <div><i style="background:${palette[4]}"></i><span>Mar</span><small>62%</small></div>
          </div>
          <small>Interés relativo por mes</small>
        </div>`,
    },
    {
      title: "Itinerarios creados / planificador",
      desc: "Visitantes que combinan bodega con otros recursos",
      source: "S21",
      foot: "Indicador simulado de uso del planificador",
      chart: `
        <div class="diag-card-chart diag-card-chart--mini">
          <div class="diag-card-mini">
            <i style="width:84%;background:${palette[0]}"></i>
            <i style="width:62%;background:${palette[1]}"></i>
            <i style="width:47%;background:${palette[2]}"></i>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Visita bodega</span><small>84%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Comida / maridaje</span><small>62%</small></div>
            <div><i style="background:${palette[2]}"></i><span>Ruta extra</span><small>47%</small></div>
          </div>
          <small>Combinación de recursos en un itinerario</small>
        </div>`,
    },
  ];

  return `
    <section class="panel diag-map-panel diag-profile-panel diag-digital-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE TARJETAS</small>
          <h2>${block.title}</h2>
          <p>Un indicador real con Q15 y tres simulados coherentes con la campaña digital</p>
        </div>
      </div>
      <div class="diag-profile-grid diag-digital-grid">
        ${digitalCards
          .map((card, idx) => `
            <article class="diag-profile-card diag-digital-card">
              <div class="diag-profile-card__head">
                <div class="diag-profile-card__badge">${idx + 1}</div>
                <div class="diag-profile-card__titles">
                  <h3>${card.title}</h3>
                  <p>${card.desc}</p>
                </div>
              </div>
              ${card.chart}
              <div class="diag-profile-card__foot">
                <span>${card.source}</span>
                <small>${card.foot}</small>
              </div>
            </article>`)
          .join("")}
      </div>
    </section>`;
}

function renderDiagnosticBehaviorCards() {
  const block = state.data.diagnostic.blocks[4];
  const s15 = window.S15_RESULTS?.diagnostic || {};
  const total = Math.max(1, s15.sample_size || 25);
  const pct = (n) => `${Math.round((Number(n || 0) / total) * 1000) / 10}%`;
  const top = (items, limit = 4) => (items || []).slice(0, limit).map(([label, value], idx) => ({ label, value, color: palette[idx % palette.length] }));
  const cards = [
    {
      title: "Recursos e instalaciones visitados",
      desc: "Bodegas y museos realmente visitados",
      source: "S7",
      foot: "Simulado a partir de visita real",
      chart: `
        <div class="diag-card-chart diag-card-chart--donut">
          <div class="diag-card-ring" style="background:conic-gradient(${palette[0]} 0 52%, ${palette[1]} 52% 78%, ${palette[2]} 78% 100%)">
            <span>${pct(19).replace("%","")}%</span>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Bodegas</span><small>52%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Museos</span><small>26%</small></div>
            <div><i style="background:${palette[2]}"></i><span>Otros recursos</span><small>22%</small></div>
          </div>
          <small>Visitas realmente realizadas</small>
        </div>`,
    },
    {
      title: "Eventos enológicos visitados",
      desc: "Catas, ferias y jornadas abiertas",
      source: "S7",
      foot: "Dato simulado",
      chart: `
        <div class="diag-card-chart diag-card-chart--bars">
          <div class="diag-card-bars">
            <i style="height:72%;background:${palette[0]}" title="Catas: 72%"></i>
            <i style="height:44%;background:${palette[1]}" title="Ferias: 44%"></i>
            <i style="height:31%;background:${palette[2]}" title="Jornadas abiertas: 31%"></i>
            <i style="height:25%;background:${palette[3]}" title="Otros: 25%"></i>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Catas</span><small>72%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Ferias</span><small>44%</small></div>
            <div><i style="background:${palette[2]}"></i><span>Jornadas</span><small>31%</small></div>
            <div><i style="background:${palette[3]}"></i><span>Otros</span><small>25%</small></div>
          </div>
          <small>Intensidad de participación</small>
        </div>`,
    },
    {
      title: "Actividades realizadas",
      desc: "Visita, cata, maridaje, compra, ruta a pie...",
      source: "S15",
      foot: `${s15.top_interest_items?.length ? "Derivado de respuesta real" : "Simulado"}`,
      chart: `
        <div class="diag-card-chart diag-card-chart--bars">
          <div class="diag-card-bars">
            ${top(s15.top_interest_items || [["Visita a bodega", 10], ["Cata", 8], ["Ruta a pie", 5], ["Maridaje", 4]], 4).map((item) => `<i style="height:${Math.max(20, (item.value / total) * 100)}%;background:${item.color}" title="${item.label}: ${pct(item.value)}"></i>`).join("")}
          </div>
          <div class="diag-chart-legend">
            ${top(s15.top_interest_items || [["Visita a bodega", 10], ["Cata", 8], ["Ruta a pie", 5], ["Maridaje", 4]], 4).map((item) => `<div><i style="background:${item.color}"></i><span>${item.label}</span><small>${pct(item.value)}</small></div>`).join("")}
          </div>
          <small>Combinación de actividades más frecuente</small>
        </div>`,
    },
    {
      title: "Medio de transporte utilizado",
      desc: "Coche, autobús, a pie desde el centro...",
      source: "S15",
      foot: "Distribución del acceso al destino",
      chart: `
        <div class="diag-card-chart diag-card-chart--hist">
          <div class="diag-card-hist">
            ${top(s15.top_transport || [["Coche propio", 12], ["A pie", 7], ["Autobús turístico", 4], ["Taxi/VTC", 1]], 4).map((item) => `<span style="height:${Math.max(20, (item.value / total) * 100)}%;background:${item.color}" title="${item.label}: ${pct(item.value)}"></span>`).join("")}
          </div>
          <div class="diag-chart-legend">
            ${top(s15.top_transport || [["Coche propio", 12], ["A pie", 7], ["Autobús turístico", 4], ["Taxi/VTC", 1]], 4).map((item) => `<div><i style="background:${item.color}"></i><span>${item.label}</span><small>${pct(item.value)}</small></div>`).join("")}
          </div>
          <small>Cómo se desplaza el visitante</small>
        </div>`,
    },
    {
      title: "Tipo de alojamiento utilizado",
      desc: "Hotel, apartamento, no pernocta...",
      source: "S15",
      foot: "Simulado sobre la encuesta",
      chart: `
        <div class="diag-card-chart diag-card-chart--donut">
          <div class="diag-card-ring" style="background:conic-gradient(${palette[0]} 0 48%, ${palette[1]} 48% 67%, ${palette[2]} 67% 88%, ${palette[3]} 88% 100%)">
            <span>4</span>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Hotel centro</span><small>48%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Apartamento</span><small>19%</small></div>
            <div><i style="background:${palette[2]}"></i><span>No pernocta</span><small>21%</small></div>
            <div><i style="background:${palette[3]}"></i><span>Hotel-bodega</span><small>12%</small></div>
          </div>
          <small>Elección de alojamiento</small>
        </div>`,
    },
    {
      title: "Tipo de oferta gastronómica elegida",
      desc: "Tapeo, maridaje, venta de vino...",
      source: "S15",
      foot: "Simulado",
      chart: `
        <div class="diag-card-chart diag-card-chart--bars">
          <div class="diag-card-bars">
            <i style="height:76%;background:${palette[0]}"></i>
            <i style="height:58%;background:${palette[1]}"></i>
            <i style="height:34%;background:${palette[2]}"></i>
            <i style="height:22%;background:${palette[3]}"></i>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Tapeo</span><small>76%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Maridaje</span><small>58%</small></div>
            <div><i style="background:${palette[2]}"></i><span>Venta vino</span><small>34%</small></div>
            <div><i style="background:${palette[3]}"></i><span>Otro</span><small>22%</small></div>
          </div>
          <small>Oferta gastronómica elegida</small>
        </div>`,
    },
    {
      title: "Gasto medio e impacto total",
      desc: "Base para el retorno económico de la campaña",
      source: "S15",
      foot: `Gasto medio ${s15.avg_spend || "N/D"} €`,
      chart: `
        <div class="diag-card-chart diag-card-chart--mini">
          <div class="diag-card-mini">
            <i style="width:78%;background:${palette[0]}"></i>
            <i style="width:61%;background:${palette[1]}"></i>
            <i style="width:86%;background:${palette[2]}"></i>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Gasto visita/cata</span><small>${s15.avg_spend || "N/D"} €</small></div>
            <div><i style="background:${palette[1]}"></i><span>Impacto total</span><small>Simulado</small></div>
            <div><i style="background:${palette[2]}"></i><span>Retorno económico</span><small>Simulado</small></div>
          </div>
          <small>Lectura económica global</small>
        </div>`,
    },
    {
      title: "Gasto por partidas",
      desc: "Instalaciones, restauración, alojamiento y eventos",
      source: "S15",
      foot: "Detalle para venta cruzada",
      chart: `
        <div class="diag-card-chart diag-card-chart--bars">
          <div class="diag-card-bars">
            <i style="height:66%;background:${palette[0]}"></i>
            <i style="height:54%;background:${palette[1]}"></i>
            <i style="height:48%;background:${palette[2]}"></i>
            <i style="height:39%;background:${palette[3]}"></i>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>Instalaciones</span><small>66%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Restauración</span><small>54%</small></div>
            <div><i style="background:${palette[2]}"></i><span>Alojamiento</span><small>48%</small></div>
            <div><i style="background:${palette[3]}"></i><span>Eventos</span><small>39%</small></div>
          </div>
          <small>Gasto por partidas</small>
        </div>`,
    },
    {
      title: "Impuestos generados por el enoturismo",
      desc: "IVA y retorno fiscal",
      source: "-",
      foot: "Anual · simulación",
      chart: `
        <div class="diag-card-chart diag-card-chart--donut">
          <div class="diag-card-ring" style="background:conic-gradient(${palette[0]} 0 62%, ${palette[1]} 62% 100%)">
            <span>2</span>
          </div>
          <div class="diag-chart-legend">
            <div><i style="background:${palette[0]}"></i><span>IVA</span><small>62%</small></div>
            <div><i style="background:${palette[1]}"></i><span>Otros</span><small>38%</small></div>
          </div>
          <small>Retorno fiscal estimado</small>
        </div>`,
    },
  ];
  return `
    <section class="panel diag-map-panel diag-profile-panel diag-digital-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE TARJETAS</small>
          <h2>${block.title}</h2>
          <p>Mezcla de datos reales S15 y simulaciones coherentes para los indicadores no encuestados</p>
        </div>
      </div>
      <div class="diag-profile-grid diag-digital-grid">
        ${cards
          .map((card, idx) => `
            <article class="diag-profile-card diag-digital-card">
              <div class="diag-profile-card__head">
                <div class="diag-profile-card__badge">${idx + 1}</div>
                <div class="diag-profile-card__titles">
                  <h3>${card.title}</h3>
                  <p>${card.desc}</p>
                </div>
              </div>
              ${card.chart}
              <div class="diag-profile-card__foot">
                <span>${card.source}</span>
                <small>${card.foot}</small>
              </div>
            </article>`)
          .join("")}
      </div>
    </section>`;
}

function renderDiagnosticSatisfactionCards() {
  const block = state.data.diagnostic.blocks[5];
  const s = window.S15_SATISFACTION || {};
  const total = Math.max(1, s.sample_size || 25);
  const pct = (n) => `${Math.round((Number(n || 0) / total) * 1000) / 10}%`;
  const top = (items, limit = 5) => (items || []).slice(0, limit);
  const aspectAvg = (items) => {
    const vals = (items || []).map(([score, count]) => [Number(score), Number(count || 0)]).filter(([score]) => Number.isFinite(score));
    const denom = vals.reduce((a, [, c]) => a + c, 0) || 1;
    return vals.reduce((a, [score, count]) => a + score * count, 0) / denom;
  };
  return `
    <section class="panel diag-map-panel diag-profile-panel diag-digital-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE TARJETAS</small>
          <h2>${block.title}</h2>
          <p>Todos los indicadores de satisfacción y reputación se leen desde la encuesta simulada</p>
        </div>
      </div>
      <div class="diag-profile-grid diag-digital-grid">
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">1</div><div class="diag-profile-card__titles"><h3>Satisfacción global</h3><p>Valoración general de la experiencia</p></div></div>
          <div class="diag-card-chart diag-card-chart--donut">
            <div class="diag-card-ring" style="background:conic-gradient(${palette[0]} 0 ${(s.avg_satisfaction / 5) * 100}%, #ebedf3 ${(s.avg_satisfaction / 5) * 100}% 100%)"><span>${s.avg_satisfaction}/5</span></div>
            <div class="diag-chart-legend"><div><i style="background:${palette[0]}"></i><span>Media</span><small>${s.avg_satisfaction}/5</small></div><div><i style="background:${palette[1]}"></i><span>Muestra</span><small>${s.sample_size}</small></div></div>
            <small>Media global de la encuesta</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Trimestral</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">2</div><div class="diag-profile-card__titles"><h3>Grado de satisfacción por aspectos</h3><p>Transporte, alojamiento, gastronomía, precio y atención</p></div></div>
          <div class="diag-card-chart diag-card-chart--donut diag-sat-aspects">
            <div class="diag-card-ring" style="background:conic-gradient(${Object.entries(s.aspects || {}).map(([label, items], idx, arr) => {
              const start = arr.slice(0, idx).reduce((sum, [, it]) => sum + aspectAvg(it), 0);
              const end = start + aspectAvg(items);
              const totalAvg = arr.reduce((sum, [, it]) => sum + aspectAvg(it), 0) || 1;
              return `${palette[idx % palette.length]} ${(start / totalAvg) * 100}% ${(end / totalAvg) * 100}%`;
            }).join(", ")})">
              <span>${((Object.values(s.aspects || {}).reduce((sum, items) => sum + aspectAvg(items), 0) / Math.max(1, Object.keys(s.aspects || {}).length))).toFixed(1)}</span>
            </div>
            <div class="diag-chart-legend diag-sat-legend">
              ${Object.entries(s.aspects || {}).map(([label, items], idx) => {
                const short = label.includes("Transporte") ? "Transporte" :
                  label.includes("Alojamiento") ? "Alojamiento" :
                  label.includes("Gastronomia") ? "Gastronomía" :
                  label.includes("Calidad-precio") ? "Precio-calidad" :
                  label.includes("Atencion") ? "Atención" : label;
                return `<div><i style="background:${palette[idx % palette.length]}"></i><span>${short}</span><small>${aspectAvg(items).toFixed(1)}/5</small></div>`;
              }).join("")}
            </div>
            <small>Satisfacción por atributos</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15 / S16</span><small>Trimestral</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">3</div><div class="diag-profile-card__titles"><h3>Aspectos mejor valorados / a mejorar</h3><p>Lo que destaca y lo que frena la experiencia</p></div></div>
          <div class="diag-card-chart diag-card-chart--mini diag-sat-pulse">
            <div class="diag-card-mini">
              <i style="width:86%;background:${palette[2]}"></i>
              <i style="width:66%;background:${palette[3]}"></i>
              <i style="width:52%;background:${palette[4]}"></i>
            </div>
            <div class="diag-chart-legend diag-sat-legend diag-sat-legend--compact">
              <div><i style="background:${palette[2]}"></i><span>Mejor</span><small>${(top(s.top_positive, 1)[0]?.[0] || "N/D").split(" ").slice(0, 1).join(" ")}</small></div>
              <div><i style="background:${palette[3]}"></i><span>Mejorar</span><small>${(top(s.top_improve, 1)[0]?.[0] || "N/D").split(" ").slice(0, 1).join(" ")}</small></div>
              <div><i style="background:${palette[4]}"></i><span>Guion</span><small>Campaña</small></div>
            </div>
            <small>Lectura abierta de la encuesta</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15 / S16</span><small>Trimestral</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">4</div><div class="diag-profile-card__titles"><h3>NPS</h3><p>Prescripción del destino</p></div></div>
          <div class="diag-card-chart diag-card-chart--donut">
            <div class="diag-card-ring" style="background:conic-gradient(${palette[1]} 0 ${(s.nps_avg / 10) * 100}%, #ebedf3 ${(s.nps_avg / 10) * 100}% 100%)"><span>${s.nps_avg}</span></div>
            <div class="diag-chart-legend"><div><i style="background:${palette[1]}"></i><span>NPS medio</span><small>${s.nps_avg}</small></div><div><i style="background:${palette[0]}"></i><span>Promotores</span><small>${pct(s.repeat_top?.[0]?.[1] || 0)}</small></div></div>
            <small>Índice de recomendación</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Trimestral</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">5</div><div class="diag-profile-card__titles"><h3>Intención de repetir visita</h3><p>Potencial de retorno en enero-marzo</p></div></div>
          <div class="diag-card-chart diag-card-chart--bars">
            <div class="diag-card-bars">
              ${top(s.repeat_top, 4).map((item, idx) => `<i style="height:${Math.max(20, (item[1] / total) * 100)}%;background:${palette[idx % palette.length]}" title="${item[0]}: ${pct(item[1])}"></i>`).join("")}
            </div>
            <div class="diag-chart-legend">
              ${top(s.repeat_top, 4).map((item, idx) => `<div><i style="background:${palette[idx % palette.length]}"></i><span>${item[0]}</span><small>${pct(item[1])}</small></div>`).join("")}
            </div>
            <small>Distribución de intención de repetir</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Trimestral</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">6</div><div class="diag-profile-card__titles"><h3>Motivos y destinos alternativos</h3><p>Qué mueve a venir y con qué compite Jerez</p></div></div>
          <div class="diag-card-chart diag-card-chart--bars">
            <div class="diag-card-bars">
              ${top(s.top_motives, 4).map((item, idx) => `<i style="height:${Math.max(20, (item[1] / total) * 100)}%;background:${palette[idx % palette.length]}" title="${item[0]}: ${pct(item[1])}"></i>`).join("")}
            </div>
            <div class="diag-chart-legend">
              ${top(s.top_alternatives, 4).map((item, idx) => `<div><i style="background:${palette[(idx + 2) % palette.length]}"></i><span>${item[0]}</span><small>${pct(item[1])}</small></div>`).join("")}
            </div>
            <small>Motivos y competencia percibida</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Semestral</small></div>
        </article>
      </div>
    </section>`;
}

function renderDiagnosticResidentsCards() {
  const block = state.data.diagnostic.blocks[7];
  const citizen = window.S15_CITIZEN || {};
  const zones = citizen.zones || [];
  const total = Math.max(1, citizen.sample_size || 1);
  const topZones = (items, limit = 4) => (items || []).slice(0, limit);
  const pct = (n) => `${Math.round((Number(n || 0) / total) * 1000) / 10}%`;
  const zonePoints = [
    { label: "Centro histórico", x: 48, y: 40, color: palette[0], value: zones.find(([label]) => /centro/i.test(label))?.[1] || 0 },
    { label: "Barrio de Santiago", x: 34, y: 56, color: palette[1], value: zones.find(([label]) => /santiago/i.test(label))?.[1] || 0 },
    { label: "Entorno de bodegas", x: 64, y: 58, color: palette[2], value: zones.find(([label]) => /bodega/i.test(label))?.[1] || 0 },
    { label: "Otras zonas", x: 72, y: 24, color: palette[3], value: zones.find(([label]) => /otras/i.test(label))?.[1] || 0 },
  ];
  const zoneSvg = `
    <svg viewBox="0 0 100 72" class="resident-map-svg" aria-label="Mapa orientativo de residencia">
      <defs>
        <linearGradient id="resGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#f5f7ff"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="98" height="70" rx="10" fill="url(#resGrad)" stroke="#dfe2eb"/>
      <path d="M14 12 L34 10 L44 18 L58 14 L72 18 L84 34 L76 56 L54 62 L28 58 L18 42 L12 28 Z" fill="#eef1fb" stroke="#dfe2eb"/>
      <path d="M28 22 L43 18 L55 24 L51 36 L37 38 L26 31 Z" fill="#f9fbff" stroke="#dfe2eb"/>
      <path d="M57 20 L72 26 L76 39 L64 46 L54 37 L52 28 Z" fill="#f3f6ff" stroke="#dfe2eb"/>
      ${zonePoints.map((p) => `
        <circle cx="${p.x}" cy="${p.y}" r="4.6" fill="${p.color}" opacity="0.95"/>
        <circle cx="${p.x}" cy="${p.y}" r="8.2" fill="${p.color}" opacity="0.14"/>
      `).join("")}
      <text x="8" y="68" font-size="4.6" fill="#68708f" font-weight="700">Jerez de la Frontera · mapa de zonas declaradas</text>
      <text x="10" y="9" font-size="4.4" fill="#08164f" font-weight="700">Centro</text>
      <text x="62" y="11" font-size="4.4" fill="#08164f" font-weight="700">Bodegas</text>
    </svg>`;
  return `
    <section class="panel diag-map-panel diag-profile-panel diag-digital-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE TARJETAS</small>
          <h2>${block.title}</h2>
          <p>Lectura de la visión ciudadana sobre el enoturismo con datos de la encuesta simulada</p>
        </div>
      </div>
      <div class="diag-profile-grid diag-digital-grid">
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">1</div><div class="diag-profile-card__titles"><h3>Edad y sexo del residente</h3><p>Caracteriza a quien responde</p></div></div>
          <div class="diag-card-chart diag-card-chart--mini">
            <div class="diag-card-mini">
              <i style="width:82%;background:${palette[0]}"></i>
              <i style="width:68%;background:${palette[1]}"></i>
              <i style="width:44%;background:${palette[2]}"></i>
            </div>
            <div class="diag-chart-legend diag-sat-legend diag-sat-legend--compact">
              <div><i style="background:${palette[0]}"></i><span>35-54</span><small>${pct(9)}</small></div>
              <div><i style="background:${palette[1]}"></i><span>Mujer</span><small>${pct(11)}</small></div>
              <div><i style="background:${palette[2]}"></i><span>Hombre</span><small>${pct(9)}</small></div>
            </div>
            <small>Segmentación social básica</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Anual</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">2</div><div class="diag-profile-card__titles"><h3>Actitud hacia el enoturismo</h3><p>Apoyo social a intensificar la actividad</p></div></div>
          <div class="diag-card-chart diag-card-chart--donut">
            <div class="diag-card-ring" style="background:conic-gradient(${palette[2]} 0 75%, #ebedf3 75% 100%)"><span>75%</span></div>
            <div class="diag-chart-legend">
              <div><i style="background:${palette[2]}"></i><span>Apoyo</span><small>75%</small></div>
              <div><i style="background:${palette[3]}"></i><span>Reservas</span><small>25%</small></div>
            </div>
            <small>Licencia social de partida</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Anual</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">3</div><div class="diag-profile-card__titles"><h3>Visión sobre los impactos</h3><p>Positivos y negativos percibidos</p></div></div>
          <div class="diag-card-chart diag-card-chart--bars">
            <div class="diag-card-bars">
              <i style="height:78%;background:${palette[0]}"></i>
              <i style="height:52%;background:${palette[1]}"></i>
              <i style="height:42%;background:${palette[2]}"></i>
              <i style="height:30%;background:${palette[3]}"></i>
            </div>
            <div class="diag-chart-legend diag-sat-legend">
              <div><i style="background:${palette[0]}"></i><span>Empleo</span><small>78%</small></div>
              <div><i style="background:${palette[1]}"></i><span>Actividad</span><small>52%</small></div>
              <div><i style="background:${palette[2]}"></i><span>Ruido</span><small>42%</small></div>
              <div><i style="background:${palette[3]}"></i><span>Precios</span><small>30%</small></div>
            </div>
            <small>Balance social del turismo</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Anual</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">4</div><div class="diag-profile-card__titles"><h3>Aspectos más y menos valorados</h3><p>Qué gusta y qué preocupa</p></div></div>
          <div class="diag-card-chart diag-card-chart--mini diag-sat-pulse">
            <div class="diag-card-mini">
              <i style="width:86%;background:${palette[4]}"></i>
              <i style="width:62%;background:${palette[5]}"></i>
              <i style="width:48%;background:${palette[0]}"></i>
            </div>
            <div class="diag-chart-legend diag-sat-legend diag-sat-legend--compact">
              <div><i style="background:${palette[4]}"></i><span>Patrimonio</span><small>${pct(11)}</small></div>
              <div><i style="background:${palette[5]}"></i><span>Empleo</span><small>${pct(7)}</small></div>
              <div><i style="background:${palette[0]}"></i><span>Ruido</span><small>${pct(9)}</small></div>
            </div>
            <small>Lectura abierta de la encuesta</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Anual</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">5</div><div class="diag-profile-card__titles"><h3>Satisfacción general</h3><p>Termómetro social de partida</p></div></div>
          <div class="diag-card-chart diag-card-chart--donut">
            <div class="diag-card-ring" style="background:conic-gradient(${palette[1]} 0 60%, #ebedf3 60% 100%)"><span>60%</span></div>
            <div class="diag-chart-legend">
              <div><i style="background:${palette[1]}"></i><span>Apoyo</span><small>75%</small></div>
              <div><i style="background:${palette[2]}"></i><span>Impacto</span><small>60%</small></div>
            </div>
            <small>Valoración ciudadana</small>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Anual</small></div>
        </article>
        <article class="diag-profile-card diag-digital-card diag-residents-map-card diag-residents-map-card--hidden">
          <div class="diag-profile-card__head"><div class="diag-profile-card__badge">6</div><div class="diag-profile-card__titles"><h3>Mapa de residencia</h3><p>Zona donde vive o trabaja cada encuestado</p></div></div>
          <div class="map-wrap">
            <div class="resident-map-frame">
              ${zoneSvg}
            </div>
            <div class="resource-legend">
              ${topZones(zones, 4).map(([label, value], idx) => `
                <div class="resource-point">
                  <b>${label}</b>
                  <small>${value} respuestas · ${pct(value)}</small>
                </div>`).join("")}
            </div>
            <p class="map-note">Mapa orientativo de las zonas declaradas por los residentes encuestados.</p>
          </div>
          <div class="diag-profile-card__foot"><span>S15</span><small>Anual</small></div>
        </article>
      </div>
    </section>`;
}

function renderDiagnosticCoyunturaCards() {
  const sourceRows = window.DACOSCDM_DATA?.rows || window.DACOSCDM_PREVISION?.rows || [];
  const block = state.data.diagnostic.blocks[8];
  const baseRows = sourceRows.length
    ? sourceRows
    : (state.data.diagnostic.blocks[8].rows || []).map((row) => ({
        seccion: "fallback",
        id: "",
        indicador: clean(row[0]),
        valor: null,
        unidad: "",
        periodo: "",
        periodo_comparacion: "",
        valor_comparacion: null,
        variacion_pct: null,
        nivel: clean(row[4] || ""),
        segmento: clean(row[1] || ""),
        fuente_dataset: clean(row[3] || ""),
        fuente_url: "",
        calidad_dato: "",
      }));
  const filters = state.coyuntura.filters;
  const filtered = baseRows.filter((item) => {
    if (filters.indicador && !normalize(item.indicador).includes(normalize(filters.indicador))) return false;
    if (filters.segmento && !normalize(item.segmento || item.periodo).includes(normalize(filters.segmento))) return false;
    if (filters.fuente && !normalize(item.fuente_dataset).includes(normalize(filters.fuente))) return false;
    if (filters.nivel && !normalize(item.nivel).includes(normalize(filters.nivel))) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const key = state.coyuntura.sortKey;
    const av = clean(a[key] ?? a.indicador ?? a.segmento);
    const bv = clean(b[key] ?? b.indicador ?? b.segmento);
    const cmp = av.localeCompare(bv, "es", { numeric: true, sensitivity: "base" });
    return state.coyuntura.sortDir === "asc" ? cmp : -cmp;
  });
  const latestById = (id, section = "") =>
    sorted.find((row) => normalize(row.id).includes(normalize(id)) && (!section || normalize(row.seccion).includes(normalize(section))));
  const groupedHistory = (id) =>
    sorted
      .filter((row) => normalize(row.id).includes(normalize(id)) && normalize(row.seccion).includes("historico"))
      .sort((a, b) => clean(a.periodo).localeCompare(clean(b.periodo), "es", { numeric: true, sensitivity: "base" }));
  const toNum = (value) => {
    const num = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(num) ? num : null;
  };
  const fmt = (value, digits = 2) => {
    const num = toNum(value);
    if (num === null) return clean(value ?? "N/D");
    if (Math.abs(num) >= 1000) return new Intl.NumberFormat("es-ES").format(num);
    return num.toLocaleString("es-ES", { maximumFractionDigits: digits });
  };
  const historyIds = [
    { id: "estancia_media", label: "Estancia media", unit: "noches", color: palette[0], type: "line" },
    { id: "ocupacion_hotelera", label: "Ocupación hotelera", unit: "%", color: palette[1], type: "bars" },
    { id: "adr", label: "ADR hotelero", unit: "€", color: palette[2], type: "line" },
    { id: "revpar", label: "RevPAR", unit: "€", color: palette[3], type: "bars" },
  ];
  const historySeries = historyIds.map((item) => {
    const rows = groupedHistory(item.id);
    return {
      ...item,
      rows,
      points: rows.map((row) => ({
        label: clean(row.periodo),
        value: toNum(row.valor),
        raw: row,
      })).filter((point) => point.value !== null),
    };
  });
  const allPeriods = [...new Set(historySeries.flatMap((series) => series.points.map((point) => point.label)))].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true, sensitivity: "base" })
  );
  const marketRows = sorted
    .filter((row) => normalize(row.seccion).includes("mercad") && normalize(row.id).includes("peso_mercado"))
    .slice(0, 4);
  const summaryIds = [
    "gasto_medio_diario_persona",
    "estancia_media",
    "ocupacion_hotelera",
    "adr",
    "revpar",
    "plazas_hoteleras",
    "establecimientos_abiertos",
    "pasajeros_aereos",
  ];
  const summaryRows = summaryIds
    .map((id) => {
      const candidates = sorted.filter((row) => normalize(row.id).includes(normalize(id)));
      return candidates.find((row) => normalize(row.seccion).includes("resumen")) || candidates[0] || null;
    })
    .filter(Boolean);
  const chartWidth = 920;
  const chartHeight = 300;
  const padX = 42;
  const padY = 26;
  const plotW = chartWidth - padX * 2;
  const plotH = chartHeight - padY * 2;
  const scaleX = (idx) => (allPeriods.length > 1 ? padX + (idx * plotW) / (allPeriods.length - 1) : padX + plotW / 2);
  const marketTotal = marketRows.reduce((sum, row) => sum + (toNum(row.valor) || 0), 0) || 1;

  return `
    <section class="panel diag-map-panel diag-profile-panel diag-coyuntura-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE TARJETAS</small>
          <h2>${block.title}</h2>
          <p>Datos conectados al Excel externo de coyuntura turística</p>
        </div>
      </div>
      <div class="kpis diag-coyuntura-kpis diag-coyuntura-kpis--summary">
        ${summaryRows.map((row, idx) => {
          const current = fmt(row.valor);
          const compare = fmt(row.valor_comparacion);
          const delta = row.variacion_pct === null || row.variacion_pct === undefined || row.variacion_pct === ""
            ? ""
            : `${Number(String(row.variacion_pct).replace(",", ".")).toLocaleString("es-ES", { maximumFractionDigits: 2 })}%`;
          return `
            <article class="kpi diag-coyuntura-kpi diag-coyuntura-kpi--summary-item">
              <div class="kpi-icon ${idx % 2 === 0 ? "pink" : "purple"}">${idx + 1}</div>
              <div>
                <h3>${clean(row.indicador)}</h3>
                <div class="kpi-value">${current}</div>
                <small>${delta ? `${delta} vs ${compare}` : `vs ${compare}`}</small>
                <small>${clean(row.fuente_dataset)}</small>
              </div>
            </article>`;
        }).join("")}
      </div>
      <div class="diag-coyuntura-history panel">
        <div class="diag-coyuntura-history__head">
          <div class="topic-heading">
            <div>
              <small>EVOLUCIÓN HISTÓRICA</small>
              <h2>Estancia media, ocupación hotelera, ADR y RevPAR</h2>
              <p>Cuatro gráficos independientes según su unidad, antes de la tabla de detalle</p>
            </div>
          </div>
        </div>
        <div class="diag-history-grid">
          ${historySeries.map((series) => {
            const seriesMin = Math.min(...series.points.map((point) => point.value), 0);
            const seriesMax = Math.max(...series.points.map((point) => point.value), 1);
            const span = seriesMax - seriesMin || 1;
            const scaleY = (value) => chartHeight - padY - ((value - seriesMin) / span) * plotH;
            const points = allPeriods
              .map((period, idx) => {
                const match = series.points.find((point) => point.label === period);
                if (!match) return null;
                return `${scaleX(idx)},${scaleY(match.value)}`;
              })
              .filter(Boolean);
            const maxValue = series.points.at(-1)?.value ?? null;
            const chartInner = series.type === "bars"
              ? `
                <svg class="diag-history-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Evolución de ${series.label}">
                  <g class="diag-history-grid-lines">
                    ${[0, 0.25, 0.5, 0.75, 1].map((step) => {
                      const value = seriesMin + span * step;
                      const y = scaleY(value);
                      return `<g><line x1="${padX}" x2="${chartWidth - padX}" y1="${y}" y2="${y}"></line><text x="8" y="${y + 4}" text-anchor="start">${fmt(value, 1)}</text></g>`;
                    }).join("")}
                  </g>
                  <g>
                    ${series.points.map((point, idx) => {
                      const barW = Math.max(14, (plotW / Math.max(series.points.length * 1.7, 1)));
                      const x = scaleX(idx) - barW / 2;
                      const h = chartHeight - padY - scaleY(point.value);
                      const y = scaleY(point.value);
                      return `<g title="${clean(point.label)}: ${fmt(point.value)} ${series.unit}">
                        <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(12, h)}" rx="8" fill="${series.color}"></rect>
                        <text x="${scaleX(idx)}" y="${chartHeight - 4}" text-anchor="middle" class="diag-history-axis-label">${point.label}</text>
                      </g>`;
                    }).join("")}
                  </g>
                </svg>`
              : `
                <svg class="diag-history-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Evolución de ${series.label}">
                  <g class="diag-history-grid-lines">
                    ${[0, 0.25, 0.5, 0.75, 1].map((step) => {
                      const value = seriesMin + span * step;
                      const y = scaleY(value);
                      return `<g><line x1="${padX}" x2="${chartWidth - padX}" y1="${y}" y2="${y}"></line><text x="8" y="${y + 4}" text-anchor="start">${fmt(value, 1)}</text></g>`;
                    }).join("")}
                  </g>
                  <g class="diag-history-series" style="--series-color:${series.color}">
                    ${points.length > 1 ? `<path class="diag-history-area" d="M ${points[0]} L ${points.join(" L ")} L ${scaleX(Math.max(allPeriods.length - 1, 0))},${chartHeight - padY} L ${scaleX(0)},${chartHeight - padY} Z"></path>` : ""}
                    ${points.length > 1 ? `<path class="diag-history-line" d="M ${points.join(" L ")}"></path>` : ""}
                    ${allPeriods.map((period, idx) => {
                      const match = series.points.find((point) => point.label === period);
                      if (!match) return "";
                      return `<circle cx="${scaleX(idx)}" cy="${scaleY(match.value)}" r="4"></circle>`;
                    }).join("")}
                  </g>
                  <g class="diag-history-axis">
                    ${allPeriods.map((period, idx) => `<text x="${scaleX(idx)}" y="${chartHeight - 4}" text-anchor="middle">${period}</text>`).join("")}
                  </g>
                </svg>`;
            const last = series.points.at(-1);
            const compare = last?.raw?.periodo_comparacion ? `Comparación: ${clean(last.raw.periodo_comparacion)}` : "Sin período de comparación";
            return `
              <article class="diag-history-card panel">
                <div class="diag-history-card__head">
                  <div>
                    <h3>${series.label}</h3>
                    <p>${maxValue !== null ? `Último dato: ${fmt(maxValue)} ${series.unit}` : "Sin datos"} · ${compare}</p>
                  </div>
                  <strong>${series.type === "bars" ? "Barras" : "Línea"}</strong>
                </div>
                ${chartInner}
              </article>`;
          }).join("")}
          <article class="diag-history-card panel">
            <div class="diag-history-card__head">
              <div>
                <h3>Visitantes por país</h3>
                <p>Distribución del peso del mercado · Comparación con el último periodo disponible</p>
              </div>
              <strong>Donut</strong>
            </div>
            <div class="diag-history-donut">
              <div class="diag-history-donut__chart" style="background:conic-gradient(${marketRows.map((row, idx) => {
                const start = marketRows.slice(0, idx).reduce((sum, item) => sum + (toNum(item.valor) || 0), 0);
                const end = start + (toNum(row.valor) || 0);
                return `${palette[idx % palette.length]} ${Math.max(0, (start / marketTotal) * 100)}% ${Math.max(0, (end / marketTotal) * 100)}%`;
              }).join(", ")})">
                <span>${fmt(marketRows.reduce((sum, row) => sum + (toNum(row.valor) || 0), 0))}%</span>
              </div>
              <div class="diag-history-donut__list">
                ${marketRows.map((row, idx) => `
                  <div class="diag-history-donut__item">
                    <i style="background:${palette[idx % palette.length]}"></i>
                    <div>
                      <strong>${clean(row.segmento || row.indicador)}</strong>
                      <small>${fmt(row.valor)}% · ${clean(row.periodo)} vs ${clean(row.periodo_comparacion)}</small>
                    </div>
                  </div>`).join("")}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>`;
}

function renderDiagnosticMediumEnvCards() {
  const block = state.data.diagnostic.blocks[9];
  const rows = (block?.rows || []).filter((row) => clean(row[0]) && !/^Bloque/.test(clean(row[0]))).slice(0, 3);
  const chartKinds = ["bars", "donut", "mini"];
  return `
    <section class="panel diag-map-panel diag-profile-panel diag-medioamb-panel">
      <div class="topic-heading">
        <div>
          <small>VISOR DE TARJETAS</small>
          <h2>${block?.title || "10. MEDIOAMBIENTALES"}</h2>
          <p>Indicadores ambientales conectados al bloque final del diagnóstico</p>
        </div>
      </div>
      <div class="diag-profile-grid diag-medioamb-grid">
        ${rows
          .map((row, idx) => {
            const title = clean(row[0]);
            const description = clean(row[2] || row[1] || "Descripción pendiente");
            const source = clean(row[3] || "");
            const periodicity = clean(row[4] || "");
            const kind = chartKinds[idx % chartKinds.length];
            const paletteColor = palette[(idx + 1) % palette.length];
            const chart =
              kind === "donut"
                ? `<div class="diag-card-chart diag-card-chart--donut"><div class="diag-card-ring" style="background:conic-gradient(${paletteColor} 0 72%, #ebedf3 72% 100%)"><span>${idx + 1}</span></div><small>Impacto ambiental</small></div>`
                : kind === "bars"
                  ? `<div class="diag-card-chart diag-card-chart--bars"><div class="diag-card-bars"><i style="height:56%;background:${paletteColor}"></i><i style="height:78%;background:${palette[(idx + 2) % palette.length]}"></i><i style="height:46%;background:${palette[(idx + 3) % palette.length]}"></i><i style="height:64%;background:${palette[(idx + 4) % palette.length]}"></i></div><small>Comparativa ambiental</small></div>`
                  : `<div class="diag-card-chart diag-card-chart--mini"><div class="diag-card-mini"><i style="width:72%;background:${paletteColor}"></i><i style="width:52%;background:${palette[(idx + 2) % palette.length]}"></i><i style="width:84%;background:${palette[(idx + 3) % palette.length]}"></i></div><small>Referencia verde</small></div>`;
            return `
              <article class="diag-profile-card diag-medioamb-card">
                <div class="diag-profile-card__head">
                  <div class="diag-profile-card__badge">${idx + 1}</div>
                  <div class="diag-profile-card__titles">
                    <h3>${title}</h3>
                    <p>${description}</p>
                  </div>
                </div>
                ${chart}
                <div class="diag-profile-card__foot">
                  <span>${source || "Fuente pendiente"}</span>
                  <small>${periodicity || "Periodicidad pendiente"}</small>
                </div>
              </article>`;
          })
          .join("")}
      </div>
    </section>`;
}

function renderBars(items, color = "#ff246d") {
  const max = Math.max(...items.map(([, v]) => v), 1);
  return items
    .map(
      ([label, value]) => `
      <div class="bar-row s15-bar">
        <span class="bar-label">${label}</span>
        <div class="bar-track"><i style="width:${Math.max(10, (value / max) * 100)}%;background:${color}"></i></div>
        <strong>${value}</strong>
      </div>`
    )
    .join("");
}

function renderS15Section() {
  const s = window.S15_SATISFACTION;
  if (!s) return "";
  const total = Math.max(1, s.sample_size || 1);
  const pct = (n) => `${Math.round((Number(n || 0) / total) * 1000) / 10}%`;
  const top = (items, limit = 5) => (items || []).slice(0, limit);
  const aspectAvg = (items) => {
    const nums = [];
    for (const [score, count] of items || []) {
      const n = Number(score);
      if (Number.isFinite(n)) nums.push({ score: n, count: Number(count || 0) });
    }
    const denom = nums.reduce((a, b) => a + b.count, 0) || 1;
    return nums.reduce((a, b) => a + b.score * b.count, 0) / denom;
  };
  return `
    <section class="panel s15-section">
      <div class="topic-heading">
        <div>
          <small>RESULTADOS S15</small>
          <h2>Lectura de las encuestas de satisfacción</h2>
          <p>Todos los indicadores se leen desde la hoja de respuestas simuladas</p>
        </div>
      </div>
      <div class="kpis s15-kpis">
        <article class="kpi"><div class="kpi-icon pink">A</div><div><h3>Satisfacción media</h3><div class="kpi-value">${s.avg_satisfaction}/5</div><small>Muestra ${s.sample_size} respuestas</small></div></article>
        <article class="kpi"><div class="kpi-icon purple">N</div><div><h3>NPS medio</h3><div class="kpi-value">${s.nps_avg}</div><small>Media de Q22 (0-10)</small></div></article>
        <article class="kpi"><div class="kpi-icon pink">R</div><div><h3>Intención de repetir</h3><div class="kpi-value">${s.repeat_pct}%</div><small>Si / Probablemente sí</small></div></article>
        <article class="kpi"><div class="kpi-icon purple">G</div><div><h3>Gasto medio</h3><div class="kpi-value">${(window.SIM_DIAG_TURISTA?.rows || []).length ? "28.8 €" : "N/D"}</div><small>Visita + cata</small></div></article>
      </div>
      <div class="block-row s15-row">
        <article class="panel block-card"><div class="block-head"><div><h3>Procedencia</h3><p>Mercados emisores más frecuentes</p></div></div><div class="block-chart">${renderDonut((window.SIM_DIAG_TURISTA?.rows || []).filter(r => String(r["Q1 Procedencia"] || "").includes("España")).length, total, "#ff246d", "España / otras procedencias")}</div></article>
        <article class="panel block-card"><div class="block-head"><div><h3>Motivos de visita</h3><p>Lo que más empuja a venir</p></div></div><div class="block-chart">${renderBars(top(s.top_motives, 5), "#7432c4")}</div></article>
        <article class="panel block-card"><div class="block-head"><div><h3>Movilidad</h3><p>Cómo se desplaza el visitante</p></div></div><div class="block-chart">${renderHistogram(top(s.transport, 5), "#23845a")}</div></article>
        <article class="panel block-card"><div class="block-head"><div><h3>Destino alternativo</h3><p>Competidores y alternativas</p></div></div><div class="block-chart">${renderBars(top(s.top_alternatives, 5), "#3066fe")}</div></article>
      </div>
      <div class="block-row s15-row">
        <article class="panel block-card"><div class="block-head"><div><h3>Aspectos mejor valorados</h3><p>Respuestas abiertas de la encuesta</p></div></div><div class="block-chart">${renderBars(top(s.top_positive, 5), "#14b8a6")}</div></article>
        <article class="panel block-card"><div class="block-head"><div><h3>Aspectos a mejorar</h3><p>Lo que más frena la experiencia</p></div></div><div class="block-chart">${renderBars(top(s.top_improve, 5), "#d43a4e")}</div></article>
        <article class="panel block-card"><div class="block-head"><div><h3>Satisfacción por aspectos</h3><p>Transporte, alojamiento, gastronomía, precio y atención</p></div></div><div class="block-chart"><div class="mini-stats">${Object.entries(s.aspects || {}).map(([label, items], idx) => `<div><b>${aspectAvg(items).toFixed(1)}/5</b><span>${label.replace("Q19", "").replace("a ", "").replace("b ", "").replace("c ", "").replace("d ", "").replace("e ", "")}</span></div>`).join("")}</div></div></article>
        <article class="panel block-card"><div class="block-head"><div><h3>Intención de repetir</h3><p>Probabilidad de volver a Jerez</p></div></div><div class="block-chart">${renderBars(top(s.repeat_top, 4), "#7432c4")}</div></article>
      </div>
    </section>`;
}

function chunkBlocks(blocks, sizes) {
  const rows = [];
  let index = 0;
  for (const size of sizes) {
    rows.push(blocks.slice(index, index + size));
    index += size;
  }
  return rows;
}

function render() {
  if (state.view === "s15") {
    el("summary-kpis").innerHTML = summaryCards("s15");
    el("blocks").innerHTML = "";
    el("s15-section").innerHTML = renderS15Section();
    el("subtitle").textContent = "Jerez de la Frontera · Resultados S15";
    el("section-kicker").textContent = "ENCUESTAS";
    el("section-title").textContent = "Resultados de las encuestas";
    el("section-desc").textContent = "Lectura ejecutiva de las respuestas simuladas";
    el("sheet-note").textContent = "Esta pestaña resume el resultado de las encuestas S15 a partir del Excel de simulación.";
    requestAnimationFrame(initLeafletMap);
  } else {
    const dataset = state.data[state.view];
    el("summary-kpis").innerHTML = summaryCards(state.view);
    if (state.view === "diagnostic") {
      const diagnosticPanel =
        state.diagnosticTab === 1
          ? renderDiagnosticProfileCards()
          : state.diagnosticTab === 2
            ? renderDiagnosticDigitalCards()
          : state.diagnosticTab === 4
              ? renderDiagnosticBehaviorCards()
            : state.diagnosticTab === 5
              ? renderDiagnosticSatisfactionCards()
            : state.diagnosticTab === 7
              ? renderDiagnosticResidentsCards()
            : state.diagnosticTab === "coyuntura"
              ? renderDiagnosticCoyunturaCards()
            : state.diagnosticTab === "medioamb"
                ? renderDiagnosticMediumEnvCards()
            : renderDiagnosticMap();
      el("blocks").innerHTML = renderDiagnosticTabs() + diagnosticPanel;
      el("blocks").classList.add("diagnostic-view");
      requestAnimationFrame(initLeafletMap);
    } else {
      el("blocks").classList.remove("diagnostic-view");
      const sizes = [4, 3];
      el("blocks").innerHTML = chunkBlocks(dataset.blocks, sizes)
        .map((row) => `<div class="block-row">${row.map((b) => renderBlock(b, state.view)).join("")}</div>`)
        .join("");
    }
    el("s15-section").innerHTML = "";
    el("subtitle").textContent =
      state.view === "diagnostic" ? "" : "Jerez de la Frontera · Resultado simulado";
    el("section-kicker").textContent = state.view === "diagnostic" ? "DIAGNÓSTICO" : "RESULTADO";
    el("section-title").textContent =
      state.view === "diagnostic" ? "Cuadro de mando diagnóstico" : "Cuadro de mando de resultado";
    el("section-desc").textContent =
      state.view === "diagnostic"
        ? "Situación de partida sin acción de invierno"
        : "Situación con acción y lectura del efecto";
    el("sheet-note").textContent =
      state.view === "diagnostic"
        ? "La hoja 1 se organiza en 10 bloques temáticos."
        : `La hoja 6 contiene ${dataset.blocks.length} bloques temáticos con datos simulados.`;
  }
  document.querySelectorAll(".topic-menu nav button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === state.view);
  });
  const blocksEl = el("blocks");
  if (blocksEl && !blocksEl._coyunturaBound) {
    blocksEl._coyunturaBound = true;
    blocksEl.addEventListener("click", (event) => {
      const tabBtn = event.target.closest("[data-diag-tab]");
      if (tabBtn && blocksEl.contains(tabBtn)) {
        const raw = tabBtn.dataset.diagTab;
        state.diagnosticTab = raw === "coyuntura" || raw === "medioamb" ? raw : Number(raw);
        render();
        return;
      }
      const sortBtn = event.target.closest("[data-coyuntura-sort-dir]");
      if (sortBtn && blocksEl.contains(sortBtn)) {
        state.coyuntura.sortDir = state.coyuntura.sortDir === "asc" ? "desc" : "asc";
        render();
      }
    });
    blocksEl.addEventListener("change", (event) => {
      const filter = event.target.closest("[data-coyuntura-filter]");
      if (filter && blocksEl.contains(filter)) {
        const key = filter.dataset.coyunturaFilter;
        state.coyuntura.filters[key] = filter.value;
        render();
      }
      const sortKey = event.target.closest("[data-coyuntura-sort-key]");
      if (sortKey && blocksEl.contains(sortKey)) {
        state.coyuntura.sortKey = sortKey.value;
        render();
      }
    });
  }
}

function initLeafletMap() {
  const mapEls = document.querySelectorAll('[data-map="jerez-map"], [data-map="resources-map"], [data-map="residents-map"], [data-map="diag-main-map"]');
  if (!window.L) return;
  mapEls.forEach((mapEl) => {
    if (!mapEl || mapEl._mapInitialized) return;
    mapEl._mapInitialized = true;
    const map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false }).setView([36.78, -6.10], 10);
    mapEl._leafletMap = map;
    if (mapEl.dataset.map === "diag-main-map") {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
      }).addTo(map);
    }
    const points = mapEl.dataset.map === "resources-map"
      ? [
          { name: 'Bodegas abiertas al enoturismo', coords: [36.6868, -6.1388] },
          { name: 'Museo / centro de interpretación', coords: [36.6902, -6.1295] },
          { name: 'Alojamiento con paquete', coords: [36.6798, -6.1248] },
          { name: 'Ruta de viñedo en poda', coords: [36.6844, -6.1492] },
          { name: 'Patrimonio complementario', coords: [36.6982, -6.1142] },
          { name: 'Oferta gastronómica', coords: [36.6724, -6.1411] },
        ]
      : mapEl.dataset.map === "residents-map"
        ? [
            { name: 'Centro histórico', coords: [36.6868, -6.1388] },
            { name: 'Barrio de Santiago', coords: [36.6860, -6.1425] },
            { name: 'Entorno de bodegas', coords: [36.6808, -6.1258] },
            { name: 'Otras zonas del municipio', coords: [36.6958, -6.1345] },
          ]
        : null;
    if (mapEl.dataset.map === "diag-main-map") {
      const stats = buildDiagnosticResourceStats();
      const groups = {};
      const bounds = [];
      stats.geolocated.forEach((item) => {
        const category = item.category || "Otros";
        groups[category] = groups[category] || L.layerGroup().addTo(map);
        const color = palette[Object.keys(groups).length % palette.length];
        L.circleMarker([item.location.lat, item.location.lng], {
          radius: 5,
          color,
          fillColor: color,
          fillOpacity: 0.8,
          weight: 1,
        }).bindTooltip(item.name).addTo(groups[category]);
        bounds.push([item.location.lat, item.location.lng]);
      });
      if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
      map._diagGroups = groups;
    } else if (points) {
      points.forEach((p) => L.marker(p.coords).addTo(map).bindTooltip(p.name));
    }
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 150);
  });
}

function init() {
  state.data = window.DASHBOARD_DATA;
  if (!document._diagGlobalBound) {
    document._diagGlobalBound = true;
    document.addEventListener("click", (event) => {
      const tabBtn = event.target.closest("[data-diag-tab]");
      if (tabBtn) {
        state.diagnosticTab = Number(tabBtn.dataset.diagTab);
        render();
        return;
      }
      const layerBtn = event.target.closest("[data-resource-layer]");
      if (layerBtn) {
        const mapEl = document.querySelector('[data-map="diag-main-map"]');
        const map = mapEl?._leafletMap;
        if (map && map._diagGroups) {
          const category = layerBtn.dataset.resourceLayer;
          const group = map._diagGroups[category];
          if (group) {
            const active = layerBtn.classList.toggle("active");
            if (active) map.addLayer(group);
            else map.removeLayer(group);
          }
        }
        return;
      }
      const sortBtn = event.target.closest("[data-coyuntura-sort-dir]");
      if (sortBtn) {
        state.coyuntura.sortDir = state.coyuntura.sortDir === "asc" ? "desc" : "asc";
        if (state.view === "diagnostic" && state.diagnosticTab === 8) render();
      }
    });
    document.addEventListener("change", (event) => {
      const filter = event.target.closest("[data-coyuntura-filter]");
      if (filter) {
        state.coyuntura.filters[filter.dataset.coyunturaFilter] = filter.value;
        if (state.view === "diagnostic" && state.diagnosticTab === 8) render();
        return;
      }
      const sortKey = event.target.closest("[data-coyuntura-sort-key]");
      if (sortKey) {
        state.coyuntura.sortKey = sortKey.value;
        if (state.view === "diagnostic" && state.diagnosticTab === 8) render();
      }
    });
  }
  document.querySelectorAll(".topic-menu nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      render();
    });
  });
  render();
}

init();
