// PAUSE! frontend prototype.
// Uses the same localStorage keys as the earlier version, so existing items remain.
const form = document.getElementById('item-form');
const container = document.getElementById('items-container');
const addDialog = document.getElementById('add-item-dialog');
const budgetDialog = document.getElementById('budget-dialog');
const desireDialog = document.getElementById('desire-dialog');
const authDialog = document.getElementById('auth-dialog');
let activeDesireItemId = null;
const toast = document.getElementById('toast');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Calendar dates are local so a late-night check-in doesn't jump to tomorrow.
function localDateKey(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizedDesireHistory(history) {
  if (!Array.isArray(history)) return [];
  const byDate = new Map();
  for (const point of history) {
    if (!point || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) continue;
    const validDate = new Date(`${point.date}T12:00:00`);
    const rating = Number(point.rating);
    if (Number.isNaN(validDate.getTime()) || localDateKey(validDate.getTime()) !== point.date) continue;
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) continue;
    byDate.set(point.date, { date: point.date, rating });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function readItems() {
  let stored;
  try { stored = JSON.parse(localStorage.getItem('pauseItems') || '[]'); }
  catch { return []; }
  if (!Array.isArray(stored)) return [];
  return stored.filter(item => item && typeof item.name === 'string' && Number.isFinite(Number(item.price)))
    .map(item => ({
      ...item,
      id: item.id || newId(),
      price: Number(item.price),
      createdAt: Number(item.createdAt) || Date.now(),
      waitingDays: Math.max(14, Number(item.waitingDays) || 14),
      reason: String(item.reason || ''),
      link: item.link || '',
      imageUrl: item.imageUrl || '',
      desireHistory: normalizedDesireHistory(item.desireHistory)
    }));
}

let items = [];
let totalSaved = Number(localStorage.getItem('pauseTotalSaved')) || 0;
let questsCleared = Number(localStorage.getItem('pauseQuestsCleared')) || 0;
let monthlyBudget = Number(localStorage.getItem('pauseMonthlyBudget')) || 500;
let decisions = readGuestDecisions();
let account = null;
let authMode = 'login';
let pendingSave = Promise.resolve();

function readGuestDecisions() {
  try { const value = JSON.parse(localStorage.getItem('pauseDecisions') || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

function guestState() {
  return { items: readItems(), totalSaved: Number(localStorage.getItem('pauseTotalSaved')) || 0,
    questsCleared: Number(localStorage.getItem('pauseQuestsCleared')) || 0,
    monthlyBudget: Number(localStorage.getItem('pauseMonthlyBudget')) || 500, decisions: readGuestDecisions() };
}
function currentState() { return { items, totalSaved, questsCleared, monthlyBudget, decisions }; }
function loadState(state) {
  const source = state && typeof state === 'object' ? state : {};
  // Normalize item data just as we do with guest data. No user input is injected into HTML.
  items = Array.isArray(source.items) ? source.items.filter(entry => entry && typeof entry.name === 'string' && Number.isFinite(Number(entry.price)))
    .map(entry => ({ ...entry, id: entry.id || newId(), price: Number(entry.price),
      createdAt: Number(entry.createdAt) || Date.now(), waitingDays: Math.max(14, Number(entry.waitingDays) || 14),
      desireHistory: normalizedDesireHistory(entry.desireHistory) })) : [];
  totalSaved = Number.isFinite(Number(source.totalSaved)) ? Math.max(0, Number(source.totalSaved)) : 0;
  questsCleared = Number.isFinite(Number(source.questsCleared)) ? Math.max(0, Number(source.questsCleared)) : 0;
  monthlyBudget = Number(source.monthlyBudget) > 0 ? Number(source.monthlyBudget) : 500;
  decisions = Array.isArray(source.decisions) ? source.decisions.filter(x => x && ['approved', 'declined'].includes(x.type)) : [];
  renderItems();
}

// Desire check-ins remain browser-local until a server endpoint is added.
function persistState() {
  for (const item of items) {
    if (item.desireHistory) localStorage.setItem(`pauseDesire:${account?.id || 'guest'}:${item.id}`, JSON.stringify(item.desireHistory));
  }
}

let toastTimeout;

function storeItems() {
  persistState();
  if (!account) {
    localStorage.setItem('pauseItems', JSON.stringify(items));
    localStorage.setItem('pauseTotalSaved', String(totalSaved));
    localStorage.setItem('pauseQuestsCleared', String(questsCleared));
    localStorage.setItem('pauseMonthlyBudget', String(monthlyBudget));
    localStorage.setItem('pauseDecisions', JSON.stringify(decisions));
  }
}
function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function updateStats() {
  document.getElementById('total-saved').textContent = money.format(totalSaved);
  document.getElementById('mobile-total-saved').textContent = money.format(totalSaved);
  document.getElementById('monthly-budget').textContent = money.format(monthlyBudget);
  document.getElementById('mobile-monthly-budget').textContent = money.format(monthlyBudget);
  document.getElementById('active-count').textContent = String(items.length);
  // A new arcade level for every 3 purchases you choose to skip.
  document.getElementById('player-level').textContent = `LVL ${String(1 + Math.floor(questsCleared / 3)).padStart(2, '0')}`;
  renderOverview();
}

// Overview chart: observations are real, the dotted curve is an explicitly
// labelled linear extrapolation of recent daily changes, never an AI prediction.
function renderOverview() {
  const declines = Math.max(questsCleared, decisions.filter(d => d.type === 'declined').length);
  const approved = decisions.filter(d => d.type === 'approved').length;
  const resolved = declines + approved;
  const rate = resolved ? Math.round(declines / resolved * 100) : null;
  document.getElementById('decline-rate').textContent = rate === null ? '—' : `${rate}%`;
  document.getElementById('declined-count').textContent = String(declines);
  document.getElementById('approved-count').textContent = String(approved);
  document.getElementById('overview-resolved').textContent = String(resolved);
  document.getElementById('overview-active').textContent = String(items.length);
  const ratio = document.getElementById('ratio-ring');
  ratio.classList.toggle('is-empty', !resolved);
  ratio.style.setProperty('--decline-pct', `${rate ?? 0}%`);
  document.getElementById('ratio-caption').textContent = resolved
    ? `${declines} skipped vs ${approved} approved purchases`
    : 'Make a decision to start your score.';

  const histories = items.map(item => normalizedDesireHistory(item.desireHistory)).filter(h => h.length);
  const lastRatings = histories.map(history => history.at(-1).rating);
  const latestAvg = lastRatings.length ? lastRatings.reduce((a, b) => a + b, 0) / lastRatings.length : null;
  document.getElementById('overview-desire').textContent = latestAvg === null ? '—' : `${latestAvg.toFixed(1)}/10`;
  const chartEl = document.getElementById('overview-desire-chart');
  const caption = document.getElementById('projection-caption');
  chartEl.replaceChildren();
  if (!histories.length) {
    const empty = document.createElement('p'); empty.className = 'chart-empty';
    empty.textContent = 'Add an item and rate your desire to begin tracking.';
    chartEl.appendChild(empty);
    caption.textContent = 'No check-ins yet. Only real ratings are charted.';
    return;
  }
  const byDate = new Map();
  histories.flat().forEach(point => {
    if (!byDate.has(point.date)) byDate.set(point.date, []);
    byDate.get(point.date).push(point.rating);
  });
  const observed = [...byDate.entries()].sort((a,b) => a[0].localeCompare(b[0])).slice(-10)
    .map(([date, ratings]) => ({ date, value: ratings.reduce((a,b) => a+b, 0) / ratings.length }));
  // At least one item requires 2 separate daily check-ins to establish a slope.
  const slopeExists = histories.some(history => history.length >= 2);
  const predictions = slopeExists ? Array.from({length: 7}, (_, day) => {
    const value = histories.reduce((sum, history) => {
      const latest = history.at(-1);
      if (history.length < 2) return sum + latest.rating;
      const prev = history.at(-2);
      const dayGap = Math.max(1, Math.round((new Date(latest.date+'T12:00:00') - new Date(prev.date+'T12:00:00')) / MS_PER_DAY));
      const slope = (latest.rating - prev.rating) / dayGap;
      return sum + Math.max(1, Math.min(10, latest.rating + slope * (day + 1)));
    }, 0) / histories.length;
    return value;
  }) : [];
  const svg = svgNode('svg', {viewBox:'0 0 540 168', role:'img', 'aria-label':'Real desire check-in averages, followed by a dotted linear projection if data allows'});
  const left=28, right=524, top=13, bottom=139, yFor=r => bottom-(r-1)/9*(bottom-top);
  for (const y of [1,5,10]) {
    svg.appendChild(svgNode('line',{x1:left,y1:yFor(y),x2:right,y2:yFor(y),stroke:'#49506f','stroke-dasharray':'4 5'}));
    svg.appendChild(svgNode('text',{x:15,y:yFor(y)+4,fill:'#aeb6d5','font-size':12},String(y)));
  }
  const observedRight = predictions.length ? 296 : 524;
  const xs = observed.map((_,i) => observed.length === 1 ? left : left+(observedRight-left)*i/(observed.length-1));
  const observedCoords = observed.map((p,i) => [xs[i], yFor(p.value)]);
  if (observedCoords.length > 1) svg.appendChild(svgNode('polyline',{points:observedCoords.map(p=>p.join(',')).join(' '),stroke:'#cefc73','stroke-width':3,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'}));
  observedCoords.forEach((p,i) => {
    const dot=svgNode('circle',{cx:p[0],cy:p[1],r:4,fill:'#cefc73'});
    dot.appendChild(svgNode('title',{},`${observed[i].date}: ${observed[i].value.toFixed(1)}/10 average recorded desire`));
    svg.appendChild(dot);
  });
  if (predictions.length) {
    const points = [[observedRight,yFor(observed.at(-1).value)], ...predictions.map((v,i)=>[observedRight+(right-observedRight)*(i+1)/7,yFor(v)])];
    svg.appendChild(svgNode('polyline',{points:points.map(p=>p.join(',')).join(' '),stroke:'#aa89ff','stroke-width':3,'stroke-dasharray':'7 6',fill:'none','stroke-linecap':'round'}));
    svg.appendChild(svgNode('line',{x1:observedRight,y1:top,x2:observedRight,y2:bottom,stroke:'#7b709e','stroke-dasharray':'3 6'}));
    svg.appendChild(svgNode('text',{x:right,y:163,fill:'#b3badd','font-size':11,'text-anchor':'end'},'+7 DAYS'));
  }
  svg.appendChild(svgNode('text',{x:left,y:163,fill:'#b3badd','font-size':11},'CHECK-INS'));
  chartEl.appendChild(svg);
  caption.textContent = predictions.length
    ? `Actual dots average logged check-ins by date; dashed line extrapolates recent per-item change for 7 days. Illustrative, not a prediction. ${histories.length} tracked item(s).`
    : 'Not enough history for a projection. Log ratings on at least two different days for one item.';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 3500);
}

function itemEmoji(name) {
  if (/shoe|sneaker|boot|nike|adidas/i.test(name)) return '👟';
  if (/headphone|airpod|earbud|speaker|music/i.test(name)) return '🎧';
  if (/phone|iphone|tablet|ipad/i.test(name)) return '📱';
  if (/game|console|controller|switch|playstation/i.test(name)) return '🎮';
  if (/shirt|hoodie|jacket|coat|pants|clothes/i.test(name)) return '🧥';
  if (/camera|lens/i.test(name)) return '📷';
  if (/watch/i.test(name)) return '⌚';
  if (/book|textbook/i.test(name)) return '📚';
  if (/laptop|macbook|computer|keyboard/i.test(name)) return '💻';
  return '🎁';
}

function renderEmpty() {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = `
    <div class="empty-icon" aria-hidden="true">🕹️</div>
    <h3>YOUR INVENTORY IS EMPTY</h3>
    <p>Next time you want to buy something, start a cooldown quest instead.</p>
    <div class="empty-actions">
      <button type="button" class="button button-primary" data-open-add>＋ ADD FIRST QUEST</button>
      <button type="button" class="empty-demo" id="load-demo">TRY DEMO ITEMS</button>
    </div>`;
  container.appendChild(empty);
}

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'item-card';
  card.dataset.itemId = item.id;
  // Fixed HTML only; all user-provided fields are inserted using textContent or safe URLs.
  card.innerHTML = `
    <div class="item-visual">
      <span class="item-tag">⏳ ON COOLDOWN</span>
      <span class="item-emoji" aria-hidden="true"></span>
    </div>
    <div class="item-body">
      <h3 class="item-name"></h3>
      <div class="item-price"></div>
      <p class="item-reason"></p>
      <div class="card-label">TIME UNTIL DECISION</div>
      <div class="timer" aria-label="Live countdown">
        <div class="time-unit"><strong data-unit="days">14</strong><small>DAYS</small></div>
        <div class="time-unit"><strong data-unit="hours">00</strong><small>HRS</small></div>
        <div class="time-unit"><strong data-unit="minutes">00</strong><small>MIN</small></div>
        <div class="time-unit"><strong data-unit="seconds">00</strong><small>SEC</small></div>
      </div>
      <div class="cooldown-track"><div class="cooldown-fill"></div></div>
      <div class="impact"><span>MONTHLY BUDGET IMPACT</span><strong class="impact-percent"></strong></div>
      <div class="budget-meter"><div class="budget-meter-fill"></div></div>
      <div class="desire-mini">
        <div class="desire-mini-heading"><span>♥ DESIRE TRACKER</span><strong class="desire-mini-score">—</strong></div>
        <div class="desire-sparkline" aria-hidden="true"></div>
        <div class="desire-mini-caption"></div>
      </div>
      <div class="card-actions">
        <button type="button" class="track-btn">↗ TRACK DESIRE</button>
        <button type="button" class="decline-btn">✦ SKIP PURCHASE</button>
      </div>
    </div>`;

  card.querySelector('.item-name').textContent = item.name;
  card.querySelector('.item-price').textContent = money.format(item.price);
  card.querySelector('.item-reason').textContent = `“${item.reason || 'No reason provided'}”`;
  card.querySelector('.item-emoji').textContent = itemEmoji(item.name);
  if (item.isDemo) {
    const tag = document.createElement('span');
    tag.className = 'demo-tag';
    tag.textContent = 'DEMO';
    card.querySelector('.item-visual').appendChild(tag);
  }
  const imageUrl = safeUrl(item.imageUrl);
  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'item-image';
    img.alt = `${item.name} product photo`;
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    img.src = imageUrl;
    card.querySelector('.item-visual').appendChild(img);
  }

  const percentage = (item.price / monthlyBudget) * 100;
  card.querySelector('.impact-percent').textContent = `${percentage.toFixed(1)}%`;
  card.querySelector('.budget-meter-fill').style.width = `${Math.min(100, percentage)}%`;
  if (percentage > 100) {
    const warning = document.createElement('div');
    warning.className = 'budget-warning';
    warning.textContent = '⚠ OVER YOUR MONTHLY BUDGET';
    card.querySelector('.budget-meter').after(warning);
  }

const history = normalizedDesireHistory(item.desireHistory);
const latest = history.at(-1);
card.querySelector('.desire-mini-score').textContent = latest ? `${latest.rating}/10` : 'NOT RATED';
card.querySelector('.desire-mini-caption').textContent = `${history.length} ${history.length === 1 ? 'check-in' : 'check-ins'} logged`;
card.querySelector('.desire-sparkline').appendChild(buildDesireSparkline(history));
card.querySelector('.track-btn').addEventListener('click', () => openDesire(item.id));
  card.querySelector('.decline-btn').addEventListener('click', () => declineItem(item.id));
  return card;
}

// Self-contained SVG graph. No Chart.js/CDN dependency, so it runs offline.
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}, label = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (label !== null) node.textContent = label;
  return node;
}

function buildDesireSparkline(history) {
  const svg = svgNode('svg', {viewBox: '0 0 180 38', preserveAspectRatio: 'none'});
  svg.appendChild(svgNode('line', {x1: 0, y1: 36, x2: 180, y2: 36, stroke: '#656b8b', 'stroke-width': 1}));
  if (!history.length) return svg;
  const points = history.map((entry, index) => ({
    x: history.length === 1 ? 90 : 5 + index / (history.length - 1) * 170,
    y: 34 - (entry.rating - 1) / 9 * 30
  }));
  if (points.length > 1) svg.appendChild(svgNode('polyline', {
    points: points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
    fill: 'none', stroke: '#cefc73', 'stroke-width': 2.5,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }));
  for (const point of points) svg.appendChild(svgNode('circle', {cx: point.x, cy: point.y, r: 3.5, fill: '#cefc73'}));
  return svg;
}

function buildDesireChart(item) {
  const history = normalizedDesireHistory(item.desireHistory);
  const svg = svgNode('svg', {viewBox: '0 0 560 236', role: 'img', 'aria-label': `Desire ratings for ${item.name}, one to ten over the cooldown`});
  const left = 43, right = 538, top = 18, bottom = 190;
  const yFor = rating => bottom - (rating - 1) / 9 * (bottom - top);
  for (const rating of [1, 3, 5, 7, 10]) {
    const y = yFor(rating);
    svg.appendChild(svgNode('line', {x1: left, y1: y, x2: right, y2: y, stroke: '#4b5276', 'stroke-dasharray': '4 6', opacity: .8}));
    svg.appendChild(svgNode('text', {x: 25, y: y + 4, fill: '#c0c5e0', 'font-size': 13, 'text-anchor': 'middle'}, rating));
  }
  svg.appendChild(svgNode('text', {x: left, y: 225, fill: '#c0c5e0', 'font-size': 12}, 'DAY 1'));
  svg.appendChild(svgNode('text', {x: right, y: 225, fill: '#c0c5e0', 'font-size': 12, 'text-anchor': 'end'}, `DAY ${item.waitingDays}`));
  // One unit of horizontal distance is one actual calendar day. Missing days aren't invented.
  const startDate = new Date(`${localDateKey(item.createdAt)}T12:00:00`);
  const points = history.map(entry => {
    const daysElapsed = Math.round((new Date(`${entry.date}T12:00:00`) - startDate) / MS_PER_DAY);
    const ratio = Math.min(1, Math.max(0, daysElapsed / Math.max(1, item.waitingDays - 1)));
    return {x: left + ratio * (right - left), y: yFor(entry.rating), rating: entry.rating, date: entry.date};
  });
  if (points.length > 1) {
    const line = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const area = `${line} L${points.at(-1).x.toFixed(1)} ${bottom} L${points[0].x.toFixed(1)} ${bottom} Z`;
    svg.appendChild(svgNode('path', {d: area, fill: '#cefc73', opacity: .09}));
    svg.appendChild(svgNode('path', {d: line, stroke: '#cefc73', 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', fill: 'none'}));
  }
  for (const p of points) {
    const circle = svgNode('circle', {cx: p.x, cy: p.y, r: 6, fill: '#cefc73', stroke: '#18203c', 'stroke-width': 3});
    circle.appendChild(svgNode('title', {}, `${p.date}: ${p.rating}/10`));
    svg.appendChild(circle);
  }
  return svg;
}

function renderDesireModal(item) {
  document.getElementById('desire-item-name').textContent = item.name;
  const history = normalizedDesireHistory(item.desireHistory);
  const latest = history.at(-1);
  document.getElementById('desire-current-value').textContent = latest ? `${latest.rating}/10` : '—';
  const chart = document.getElementById('desire-chart');
  chart.replaceChildren(buildDesireChart(item));
  const insight = document.getElementById('desire-chart-insight');
  if (!history.length) insight.textContent = 'No data yet. Rate your desire below to start the graph.';
  else if (history.length === 1) insight.textContent = `✦ FIRST CHECK-IN: ${latest.rating}/10. Come back another day to see a trend.`;
  else {
    const change = latest.rating - history[0].rating;
    insight.textContent = change < 0
      ? `↘ YOUR DESIRE DROPPED ${Math.abs(change)} POINTS since your first check-in!`
      : change > 0
        ? `↗ YOUR DESIRE ROSE ${change} POINTS since your first check-in.`
        : `→ YOUR DESIRE IS UNCHANGED since your first check-in.`;
  }
  const ratingInput = document.getElementById('desire-rating');
  ratingInput.value = history.find(point => point.date === localDateKey())?.rating ?? latest?.rating ?? 8;
  document.getElementById('desire-rating-value').textContent = `${ratingInput.value}/10`;
}

function openDesire(id) {
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  activeDesireItemId = id;
  renderDesireModal(item);
  desireDialog.showModal();
}

document.getElementById('initial-desire').addEventListener('input', event => {
  document.getElementById('initial-desire-value').textContent = `${event.target.value}/10`;
});
document.getElementById('desire-rating').addEventListener('input', event => {
  document.getElementById('desire-rating-value').textContent = `${event.target.value}/10`;
});
document.getElementById('desire-form').addEventListener('submit', event => {
  event.preventDefault();
  const item = items.find(entry => entry.id === activeDesireItemId);
  if (!item) return;
  const rating = Number(document.getElementById('desire-rating').value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return;
  const today = localDateKey();
  item.desireHistory = normalizedDesireHistory([
    ...(item.desireHistory || []).filter(entry => entry.date !== today),
    {date: today, rating}
  ]);
  storeItems();
  renderItems();
  renderDesireModal(item);
  showToast(`♥ CHECK-IN SAVED! Desire level: ${rating}/10`);
});

function updateTimers() {
  const now = Date.now();
  for (const card of container.querySelectorAll('.item-card')) {
    const item = items.find(entry => entry.id === card.dataset.itemId);
    if (!item) continue;
    const total = item.waitingDays * MS_PER_DAY;
    const remaining = Math.max(0, item.createdAt + total - now);
    const days = Math.floor(remaining / MS_PER_DAY);
    const hours = Math.floor((remaining % MS_PER_DAY) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    card.querySelector('[data-unit="days"]').textContent = String(days).padStart(2, '0');
    card.querySelector('[data-unit="hours"]').textContent = String(hours).padStart(2, '0');
    card.querySelector('[data-unit="minutes"]').textContent = String(minutes).padStart(2, '0');
    card.querySelector('[data-unit="seconds"]').textContent = String(seconds).padStart(2, '0');
    card.querySelector('.cooldown-fill').style.width = `${Math.max(0, Math.min(100, (now - item.createdAt) / total * 100))}%`;
    const ready = remaining <= 0;
    card.classList.toggle('is-ready', ready);
    card.querySelector('.item-tag').textContent = ready ? '✓ COOLDOWN COMPLETE' : '⏳ ON COOLDOWN';

    const linkExists = !!card.querySelector('.purchase-link');
    const url = safeUrl(item.link);
    if (ready && url && !linkExists) {
      const link = document.createElement('a');
      link.className = 'purchase-link';
      link.textContent = 'VIEW ORIGINAL ITEM ↗';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.querySelector('.card-actions').prepend(link);
    }
    if (ready && !card.querySelector('.approve-btn')) {
      const approvedButton = document.createElement('button');
      approvedButton.type = 'button';
      approvedButton.className = 'approve-btn';
      approvedButton.textContent = '✓ APPROVE PURCHASE';
      approvedButton.addEventListener('click', () => approveItem(item.id));
      card.querySelector('.card-actions').appendChild(approvedButton);
    }
  }
}

function renderItems() {
  container.replaceChildren();
  if (!items.length) renderEmpty();
  else items.forEach(item => container.appendChild(renderCard(item)));
  updateStats();
  updateTimers();
}

async function declineItem(id) {
  const item = items.find(entry => entry.id === id);
  if (!item || !confirm(`Skip buying “${item.name}” and count ${money.format(item.price)} as potential spending avoided?`)) return;
  try {
    if (!account) {
      items = items.filter(entry => entry.id !== id);
      totalSaved += Number(item.price);
      questsCleared++;
      decisions.push({type:'declined',price:item.price,itemName:item.name,at:Date.now()});
      storeItems(); renderItems(); showToast('✦ QUEST CLEARED!'); return;
    }
    await apiJson(`/items/${id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'declined'})});
    await refreshBackend();
    showToast(`✦ QUEST CLEARED! ${money.format(item.price)} in spending avoided.`);
  } catch (error) { showToast(`⚠ ${error.message}`); }
}

async function approveItem(id) {
  const item = items.find(entry => entry.id === id);
  if (!item || Date.now() < item.createdAt + item.waitingDays * MS_PER_DAY) return;
  if (!confirm(`Mark “${item.name}” as approved after the cooldown? No payment is made.`)) return;
  try {
    if (!account) {
      items = items.filter(entry => entry.id !== id);
      decisions.push({type:'approved',price:item.price,itemName:item.name,at:Date.now()});
      storeItems(); renderItems(); showToast('✓ PURCHASE APPROVED'); return;
    }
    await apiJson(`/items/${id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'purchased'})});
    await refreshBackend();
    showToast('✓ PURCHASE APPROVED. You made an intentional choice.');
  } catch (error) { showToast(`⚠ ${error.message}`); }
}

function openAdd() {
  form.reset();
  document.getElementById('waiting-days').value = '14';
  document.getElementById('initial-desire').value = '8';
  document.getElementById('initial-desire-value').textContent = '8/10';
  addDialog.showModal();
  document.getElementById('item-name').focus();
}

// Event delegation supports both header/hero buttons and the empty-state button.
document.addEventListener('click', event => {
  if (event.target.closest('[data-open-add]')) openAdd();
  if (event.target.closest('[data-close-dialog]')) event.target.closest('dialog').close();
  if (event.target.closest('#load-demo')) { if (!account) loadDemo(); else showToast('Demo available in guest mode only.'); }
});

for (const dialog of [addDialog, budgetDialog, desireDialog, authDialog]) {
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const name = document.getElementById('item-name').value.trim();
  const price = Number(document.getElementById('item-price').value);
  const reason = document.getElementById('item-reason').value.trim();
  const link = document.getElementById('item-link').value.trim();
  const imageUrl = document.getElementById('item-image').value.trim();
  const waitingDays = Number(document.getElementById('waiting-days').value);
  const initialDesire = Number(document.getElementById('initial-desire').value);
  if (!name || !reason || !Number.isFinite(price) || price <= 0 || !Number.isInteger(waitingDays) || waitingDays < 14 || waitingDays > 365 || !Number.isInteger(initialDesire) || initialDesire < 1 || initialDesire > 10) {
    alert('Enter an item name, a positive price, a reason, and a cooldown between 14 and 365 days.');
    return;
  }
  if ((link && !safeUrl(link)) || (imageUrl && !safeUrl(imageUrl))) {
    alert('Product and image URLs must start with http:// or https://');
    return;
  }
  try {
    if (!account) {
      const created = {id:newId(),name,price,reason,link,imageUrl,waitingDays,createdAt:Date.now(),desireHistory:[{date:localDateKey(),rating:initialDesire}]};
      items.unshift(created); storeItems(); renderItems(); addDialog.close();
      showToast('⏳ COOLDOWN STARTED!'); return;
    }
    const created = await apiJson('/items', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,price,reason,productUrl:link,photoUrl:imageUrl,waitingDays})});
    localStorage.setItem(`pauseDesire:${account?.id || 'guest'}:${created.id}`, JSON.stringify([{date:localDateKey(),rating:initialDesire}]));
    await refreshBackend();
    addDialog.close();
    document.getElementById('waiting-list').scrollIntoView({block:'start',behavior:'smooth'});
    showToast('⏳ COOLDOWN STARTED! You got this.');
  } catch (error) { showToast(`⚠ ${error.message}`); }
});

function openBudget() {
  document.getElementById('budget-input').value = String(monthlyBudget);
  budgetDialog.showModal();
}
document.getElementById('edit-budget').addEventListener('click', openBudget);
document.getElementById('mobile-edit-budget').addEventListener('click', openBudget);
document.getElementById('budget-form').addEventListener('submit', async event => {
  event.preventDefault();
  const newBudget = Number(document.getElementById('budget-input').value);
  if (!Number.isFinite(newBudget) || newBudget <= 0) {
    alert('Enter a positive monthly budget.');
    return;
  }
  try {
    if (!account) {
      monthlyBudget = newBudget; storeItems(); renderItems(); budgetDialog.close();
      showToast('✓ Monthly budget updated.'); return;
    }
    await apiJson('/budget', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({monthlyBudget:newBudget})});
    await refreshBackend();
    budgetDialog.close();
    showToast('✓ Monthly budget updated.');
  } catch (error) { showToast(`⚠ ${error.message}`); }
});

function loadDemo() {
  if (items.length) return;
  const demos = [
    { name: 'Wireless Headphones', price: 229.99, reason: 'They look amazing, but my current pair still works.', ago: 2 },
    { name: 'Running Sneakers', price: 149.00, reason: 'I like the colour, but do I really need another pair?', ago: 7 },
    { name: 'Gaming Controller', price: 89.99, reason: 'It would be fun for weekend gaming.', ago: 14.1 },
    { name: 'New Hoodie', price: 79.00, reason: 'Saw it online and wanted it instantly.', ago: 1 }
  ];
const sampleRatings = [[9, 8, 6], [10, 8, 7, 5, 4], [8, 6, 5, 4], [8, 7]];
items = demos.map((demo, index) => {
  const scores = sampleRatings[index].slice(-Math.min(sampleRatings[index].length, Math.max(1, Math.ceil(demo.ago))));
  const desireHistory = scores.map((rating, i) => ({
    date: localDateKey(Date.now() - (scores.length - 1 - i) * MS_PER_DAY), rating
  }));
  return { id: newId(), name: demo.name, price: demo.price, reason: demo.reason,
    waitingDays: 14, createdAt: Date.now() - demo.ago * MS_PER_DAY,
    link: '', imageUrl: '', isDemo: true, desireHistory };
});
  storeItems();
  renderItems();
  showToast('DEMO LOADED ✦ These are sample items.');
}



async function apiJson(path, options = {}) {
  if (!account || !session?.access_token) throw new Error('Sign in to sync your account');
  const headers = {...(options.headers || {}), Authorization: `Bearer ${session.access_token}`};
  const response = await fetch(path, {...options, headers});
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}
function mapBackendItem(item) {
  let desireHistory = [];
  try { desireHistory = normalizedDesireHistory(JSON.parse(localStorage.getItem(`pauseDesire:${account?.id || 'guest'}:${item.id}`) || '[]')); } catch {}
  return {id:String(item.id), name:item.name, price:Number(item.price), reason:item.reason || '',
    link:item.productUrl || '', imageUrl:item.photoUrl || '',
    createdAt:Date.parse(item.createdAt),
    waitingDays:Math.max(14,Math.round((Date.parse(item.deadline)-Date.parse(item.createdAt))/MS_PER_DAY)),
    desireHistory};
}
async function refreshBackend() {
  const [allItems, budget, stats] = await Promise.all([
    apiJson('/items'),apiJson('/budget'),apiJson('/stats')
  ]);
  items = allItems.filter(item => item.status === 'waiting').map(mapBackendItem);
  monthlyBudget = Number(budget.monthlyBudget);
  totalSaved = Number(stats.totalSaved);
  const declined = allItems.filter(item => item.status === 'declined');
  const purchased = allItems.filter(item => item.status === 'purchased');
  questsCleared = declined.length;
  decisions = [...declined.map(item => ({type:'declined',price:Number(item.price),itemName:item.name,at:Date.parse(item.createdAt)})),
    ...purchased.map(item => ({type:'approved',price:Number(item.price),itemName:item.name,at:Date.parse(item.createdAt)}))];
  renderItems();
}


setInterval(updateTimers, 1000);


// Supabase email/password authentication; server independently validates tokens on every request.
const authTrigger = document.getElementById('account-trigger');
let authConfig = null;
let session = null;
const SESSION_KEY = 'pauseSupabaseSession';
function authUi() {
  document.getElementById('signed-out-panel').hidden = !!account;
  document.getElementById('signed-in-panel').hidden = !account;
  document.getElementById('account-email').textContent = account?.email || '';
  authTrigger.textContent = account ? '♟ ' + account.email : '♟ LOG IN / SIGN UP';
  document.getElementById('privacy-note').textContent = account
    ? '✧ Signed in: your quests and budget are private to your account.'
    : '✧ Guest mode: progress is saved only in this browser. Sign in to sync a separate account.';
}
function selectAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-login-tab').classList.toggle('is-selected',mode==='login');
  document.getElementById('auth-register-tab').classList.toggle('is-selected',mode==='register');
  document.getElementById('auth-confirm-group').hidden = mode !== 'register';
  document.getElementById('auth-submit').textContent = mode==='login' ? 'LOG IN' : 'SIGN UP';
  document.getElementById('auth-error').hidden = true;
}
function showAuthError(message) {
  const el=document.getElementById('auth-error'); el.textContent=message; el.hidden=false;
}
async function supabaseAuth(path, payload, token) {
  if (!authConfig?.url || !authConfig?.anonKey) throw new Error('Auth not configured on Railway');
  const response=await fetch(`${authConfig.url.replace(/\/$/,'')}/auth/v1/${path}`, {
    method:payload ? 'POST' : 'GET',
    headers:{apikey:authConfig.anonKey,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const data=await response.json();
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || data.error || 'Authentication failed');
  return data;
}
async function useSession(nextSession) {
  if (!nextSession?.access_token || !nextSession?.user?.id) throw new Error('Please confirm your email, then log in.');
  // Keep current guest state until authenticated data has been successfully fetched.
  const oldAccount=account, oldSession=session;
  account={id:nextSession.user.id,email:nextSession.user.email}; session=nextSession;
  try { await refreshBackend(); }
  catch (err) { account=oldAccount; session=oldSession; throw err; }
  localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  authUi();
}
function useGuest() {
  account=null; session=null; localStorage.removeItem(SESSION_KEY);
  loadState(guestState()); authUi();
}
authTrigger.addEventListener('click',()=>{authUi();authDialog.showModal();});
document.getElementById('continue-guest').addEventListener('click',()=>authDialog.close());
document.getElementById('auth-login-tab').addEventListener('click',()=>selectAuthMode('login'));
document.getElementById('auth-register-tab').addEventListener('click',()=>selectAuthMode('register'));
document.getElementById('auth-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=document.getElementById('auth-submit'); submit.disabled=true;
  document.getElementById('auth-error').hidden=true;
  try {
    const email=document.getElementById('auth-email').value.trim();
    const password=document.getElementById('auth-password').value;
    if(authMode==='register' && password!==document.getElementById('auth-confirm').value)
      throw new Error('Passwords do not match');
    const data=await supabaseAuth(authMode==='register'?'signup':'token?grant_type=password', {email,password});
    if (!data.access_token) {
      showToast('✉ Check your email to confirm your account, then log in.');
      selectAuthMode('login'); return;
    }
    await useSession(data);
    authDialog.close(); document.getElementById('auth-form').reset();
    showToast('✓ SIGNED IN! Your private quests are loaded.');
  } catch(err) { showAuthError(err.message); }
  finally { submit.disabled=false; }
});
document.getElementById('logout-button').addEventListener('click',()=>{
  useGuest(); authDialog.close(); showToast('SIGNED OUT. Back in guest mode.');
});
async function bootAuth() {
  useGuest();
  try {
    const response=await fetch('/auth-config'); authConfig=await response.json();
    const saved=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    if(saved?.refresh_token) {
      const refreshed=await supabaseAuth('token?grant_type=refresh_token',{refresh_token:saved.refresh_token});
      await useSession(refreshed);
    }
  } catch(err) {
    useGuest();
    if(localStorage.getItem(SESSION_KEY)) showToast('Session expired. Please log in again.');
  }
}
bootAuth();
