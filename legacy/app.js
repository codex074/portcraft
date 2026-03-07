/* ====================================
   TFEX Trading Journal — App Logic
   ==================================== */

// ——————————— State ———————————
const state = {
  trades: [],
  apiUrl: localStorage.getItem('tfex_api_url') || '',
  multipliers: JSON.parse(localStorage.getItem('tfex_multipliers') || 'null') || {
    S50: 200, GF: 1000, GFM: 100, SIF: 1000, DW: 1, Other: 1
  },
  charts: {},
  currentPage: 'dashboard',
  sortColumn: 'Date',
  sortDirection: 'desc'
};

// ——————————— Init ———————————
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFormListeners();
  initSettingsListeners();
  initMobileMenu();
  initSortable();
  loadSettings();
  loadTrades();
  lucide.createIcons();

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('tradeDate').value = today;
});

// ——————————— Navigation ———————————
function initNavigation() {
  document.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
    });
  });

  // Handle hash on load
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    navigateTo(hash);
  });
}

function navigateTo(page) {
  state.currentPage = page;

  // Update nav links
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Show page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    // Re-trigger animation
    pageEl.style.animation = 'none';
    pageEl.offsetHeight;
    pageEl.style.animation = '';
  }

  window.location.hash = page;

  // Close mobile menu
  closeMobileMenu();

  // Refresh charts if dashboard
  if (page === 'dashboard') {
    setTimeout(() => updateDashboard(), 100);
  }

  if (page === 'trades') {
    renderAllTrades();
  }
}

// ——————————— Mobile Menu ———————————
function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const overlay = document.getElementById('sidebarOverlay');

  toggle.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay.addEventListener('click', closeMobileMenu);
}

function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ——————————— API / Google Sheets ———————————
async function apiRequest(method, body = null) {
  if (!state.apiUrl) {
    return null;
  }

  try {
    const options = { method };

    if (method === 'POST' && body) {
      options.body = JSON.stringify(body);
      options.headers = { 'Content-Type': 'text/plain' };
    }

    const url = method === 'GET' && body
      ? `${state.apiUrl}?${new URLSearchParams(body)}`
      : state.apiUrl;

    const response = await fetch(url, options);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Error:', error);
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    return null;
  }
}

async function loadTrades() {
  if (!state.apiUrl) {
    updateConnectionStatus(false);
    return;
  }

  showLoading(true);
  const result = await apiRequest('GET', { action: 'getAll' });
  showLoading(false);

  if (result && result.trades) {
    state.trades = result.trades;
    updateConnectionStatus(true);
    updateDashboard();
    renderAllTrades();
  } else {
    updateConnectionStatus(false);
  }
}

async function addTrade(tradeData) {
  if (!state.apiUrl) {
    showToast('กรุณาตั้งค่า API URL ก่อน', 'error');
    return false;
  }

  showLoading(true);
  const multiplier = state.multipliers[tradeData.symbol] || 1;
  const result = await apiRequest('POST', {
    action: 'add',
    ...tradeData,
    pointMultiplier: multiplier
  });
  showLoading(false);

  if (result && result.success) {
    showToast('บันทึกการเทรดสำเร็จ!', 'success');
    await loadTrades();
    return true;
  } else {
    showToast('ไม่สามารถบันทึกได้: ' + (result?.error || 'Unknown error'), 'error');
    return false;
  }
}

async function deleteTradeById(id) {
  if (!confirm('ยืนยันการลบ trade นี้?')) return;

  showLoading(true);
  const result = await apiRequest('POST', { action: 'delete', id });
  showLoading(false);

  if (result && result.success) {
    showToast('ลบ trade สำเร็จ', 'success');
    await loadTrades();
  } else {
    showToast('ไม่สามารถลบได้', 'error');
  }
}

// ——————————— Settings ———————————
function initSettingsListeners() {
  document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
}

async function testConnection() {
  const url = document.getElementById('apiUrl').value.trim();
  const resultEl = document.getElementById('connectionTestResult');

  if (!url) {
    resultEl.className = 'test-result error';
    resultEl.textContent = 'กรุณากรอก URL';
    return;
  }

  resultEl.className = 'test-result info';
  resultEl.style.display = 'block';
  resultEl.textContent = 'กำลังทดสอบ...';

  try {
    const response = await fetch(`${url}?action=getAll`);
    const data = await response.json();

    if (data && (data.trades !== undefined)) {
      resultEl.className = 'test-result success';
      resultEl.textContent = `✅ เชื่อมต่อสำเร็จ! พบ ${data.trades.length} trades`;
      state.apiUrl = url;
      localStorage.setItem('tfex_api_url', url);
      updateConnectionStatus(true);
      await loadTrades();
    } else {
      resultEl.className = 'test-result error';
      resultEl.textContent = '❌ ไม่สามารถเชื่อมต่อได้ — ตรวจสอบ URL อีกครั้ง';
    }
  } catch (err) {
    resultEl.className = 'test-result error';
    resultEl.textContent = '❌ เชื่อมต่อล้มเหลว: ' + err.message;
  }
}

function saveSettings() {
  // Save API URL
  const url = document.getElementById('apiUrl').value.trim();
  if (url) {
    state.apiUrl = url;
    localStorage.setItem('tfex_api_url', url);
  }

  // Save multipliers
  state.multipliers = {
    S50: parseFloat(document.getElementById('multS50').value) || 200,
    GF: parseFloat(document.getElementById('multGF').value) || 1000,
    GFM: parseFloat(document.getElementById('multGFM').value) || 100,
    SIF: parseFloat(document.getElementById('multSIF').value) || 1000,
    DW: parseFloat(document.getElementById('multDW').value) || 1,
    Other: parseFloat(document.getElementById('multOther').value) || 1
  };
  localStorage.setItem('tfex_multipliers', JSON.stringify(state.multipliers));

  showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
}

function loadSettings() {
  // Load API URL
  if (state.apiUrl) {
    document.getElementById('apiUrl').value = state.apiUrl;
  }

  // Load multipliers
  document.getElementById('multS50').value = state.multipliers.S50;
  document.getElementById('multGF').value = state.multipliers.GF;
  document.getElementById('multGFM').value = state.multipliers.GFM;
  document.getElementById('multSIF').value = state.multipliers.SIF;
  document.getElementById('multDW').value = state.multipliers.DW;
  document.getElementById('multOther').value = state.multipliers.Other;
}

function updateConnectionStatus(connected) {
  const dots = document.querySelectorAll('.status-dot');
  const statusText = document.querySelector('.status-text');

  dots.forEach(dot => {
    dot.className = connected ? 'status-dot online' : 'status-dot offline';
  });

  if (statusText) {
    statusText.textContent = connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ';
  }
}

// ——————————— Form ———————————
function initFormListeners() {
  const form = document.getElementById('tradeForm');
  form.addEventListener('submit', handleTradeSubmit);

  // Live P&L preview
  ['tradeEntry', 'tradeExit', 'tradeContracts', 'tradeCommission', 'tradeSymbol'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePnlPreview);
  });

  document.querySelectorAll('input[name="tradeSide"]').forEach(radio => {
    radio.addEventListener('change', updatePnlPreview);
  });

  document.getElementById('resetFormBtn').addEventListener('click', () => {
    setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('tradeDate').value = today;
      updatePnlPreview();
      lucide.createIcons();
    }, 10);
  });
}

function updatePnlPreview() {
  const side = document.querySelector('input[name="tradeSide"]:checked')?.value || 'Long';
  const entry = parseFloat(document.getElementById('tradeEntry').value) || 0;
  const exit = parseFloat(document.getElementById('tradeExit').value) || 0;
  const contracts = parseInt(document.getElementById('tradeContracts').value) || 1;
  const commission = parseFloat(document.getElementById('tradeCommission').value) || 0;
  const symbol = document.getElementById('tradeSymbol').value || 'S50';
  const multiplier = state.multipliers[symbol] || 1;

  let pnlPoints = 0;
  if (side === 'Long') {
    pnlPoints = (exit - entry) * contracts;
  } else {
    pnlPoints = (entry - exit) * contracts;
  }

  const pnlBaht = pnlPoints * multiplier;
  const netPnl = pnlBaht - commission;

  const pointsEl = document.getElementById('previewPoints');
  const bahtEl = document.getElementById('previewBaht');
  const netEl = document.getElementById('previewNet');

  pointsEl.textContent = pnlPoints.toFixed(2);
  bahtEl.textContent = '฿' + formatNumber(pnlBaht);
  netEl.textContent = '฿' + formatNumber(netPnl);

  // Color
  const color = netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  pointsEl.style.color = pnlPoints >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  bahtEl.style.color = pnlBaht >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  netEl.style.color = color;
}

async function handleTradeSubmit(e) {
  e.preventDefault();

  const tradeData = {
    date: document.getElementById('tradeDate').value,
    symbol: document.getElementById('tradeSymbol').value,
    side: document.querySelector('input[name="tradeSide"]:checked').value,
    entryPrice: parseFloat(document.getElementById('tradeEntry').value),
    exitPrice: parseFloat(document.getElementById('tradeExit').value),
    contracts: parseInt(document.getElementById('tradeContracts').value),
    commission: parseFloat(document.getElementById('tradeCommission').value) || 0,
    strategy: document.getElementById('tradeStrategy').value,
    notes: document.getElementById('tradeNotes').value,
    screenshotUrl: document.getElementById('tradeScreenshot').value
  };

  const success = await addTrade(tradeData);
  if (success) {
    document.getElementById('tradeForm').reset();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tradeDate').value = today;
    updatePnlPreview();
    lucide.createIcons();
  }
}

// ——————————— Dashboard ———————————
function updateDashboard() {
  const filter = document.getElementById('dashboardFilter').value;
  let trades = [...state.trades];

  // Filter by days
  if (filter !== 'all') {
    const days = parseInt(filter);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    trades = trades.filter(t => new Date(t['Date']) >= cutoff);
  }

  updateSummaryCards(trades);
  updateCharts(trades);
  renderRecentTrades(trades);
}

function updateSummaryCards(trades) {
  const totalNetPnl = trades.reduce((sum, t) => sum + (parseFloat(t['Net P&L']) || 0), 0);
  const wins = trades.filter(t => (parseFloat(t['Net P&L']) || 0) > 0);
  const losses = trades.filter(t => (parseFloat(t['Net P&L']) || 0) <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgPnl = trades.length > 0 ? totalNetPnl / trades.length : 0;

  // Max Drawdown
  let maxDrawdown = 0;
  let peak = 0;
  let equity = 0;
  const sortedTrades = [...trades].sort((a, b) => new Date(a['Date']) - new Date(b['Date']));
  sortedTrades.forEach(t => {
    equity += parseFloat(t['Net P&L']) || 0;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  // Profit Factor
  const totalProfit = wins.reduce((sum, t) => sum + (parseFloat(t['Net P&L']) || 0), 0);
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + (parseFloat(t['Net P&L']) || 0), 0));
  const profitFactor = totalLoss > 0 ? (totalProfit / totalLoss) : (totalProfit > 0 ? '∞' : 0);

  document.getElementById('totalNetPnl').textContent = '฿' + formatNumber(totalNetPnl);
  document.getElementById('totalNetPnl').style.color = totalNetPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  document.getElementById('winRate').textContent = winRate.toFixed(1) + '%';
  document.getElementById('totalTrades').textContent = trades.length;
  document.getElementById('avgPnl').textContent = '฿' + formatNumber(avgPnl);
  document.getElementById('avgPnl').style.color = avgPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  document.getElementById('maxDrawdown').textContent = '฿' + formatNumber(maxDrawdown);
  document.getElementById('profitFactor').textContent = typeof profitFactor === 'string' ? profitFactor : profitFactor.toFixed(2);
}

// ——————————— Charts ———————————
function updateCharts(trades) {
  const sortedTrades = [...trades].sort((a, b) => new Date(a['Date']) - new Date(b['Date']));

  updateEquityCurve(sortedTrades);
  updateDailyPnlChart(sortedTrades);
  updateWinLossChart(trades);
  updateStrategyChart(trades);
  updateSymbolChart(trades);
}

const chartDefaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#94a3b8',
        font: { family: 'Outfit', size: 12 }
      }
    }
  },
  scales: {
    x: {
      ticks: { color: '#64748b', font: { family: 'Outfit', size: 11 } },
      grid: { color: 'rgba(255,255,255,0.04)' }
    },
    y: {
      ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 } },
      grid: { color: 'rgba(255,255,255,0.04)' }
    }
  }
};

function updateEquityCurve(trades) {
  const ctx = document.getElementById('equityCurveChart');
  if (state.charts.equity) state.charts.equity.destroy();

  let equity = 0;
  const labels = [];
  const data = [];

  trades.forEach(t => {
    equity += parseFloat(t['Net P&L']) || 0;
    labels.push(t['Date']);
    data.push(equity);
  });

  if (labels.length === 0) {
    labels.push('ยังไม่มีข้อมูล');
    data.push(0);
  }

  state.charts.equity = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Equity',
        data,
        borderColor: '#7c5cfc',
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(124, 92, 252, 0.3)');
          gradient.addColorStop(1, 'rgba(124, 92, 252, 0.0)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        borderWidth: 2.5,
        pointRadius: trades.length > 30 ? 0 : 3,
        pointBackgroundColor: '#7c5cfc',
        pointBorderColor: '#0a0e1a',
        pointBorderWidth: 2
      }]
    },
    options: {
      ...chartDefaultOptions,
      plugins: {
        ...chartDefaultOptions.plugins,
        legend: { display: false }
      }
    }
  });
}

function updateDailyPnlChart(trades) {
  const ctx = document.getElementById('dailyPnlChart');
  if (state.charts.daily) state.charts.daily.destroy();

  // Aggregate by date
  const dailyMap = {};
  trades.forEach(t => {
    const date = t['Date'];
    if (!dailyMap[date]) dailyMap[date] = 0;
    dailyMap[date] += parseFloat(t['Net P&L']) || 0;
  });

  const labels = Object.keys(dailyMap);
  const data = Object.values(dailyMap);
  const colors = data.map(v => v >= 0 ? 'rgba(0, 212, 170, 0.75)' : 'rgba(255, 71, 87, 0.75)');

  state.charts.daily = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net P&L',
        data,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      ...chartDefaultOptions,
      plugins: {
        ...chartDefaultOptions.plugins,
        legend: { display: false }
      }
    }
  });
}

function updateWinLossChart(trades) {
  const ctx = document.getElementById('winLossChart');
  if (state.charts.winLoss) state.charts.winLoss.destroy();

  const wins = trades.filter(t => (parseFloat(t['Net P&L']) || 0) > 0).length;
  const losses = trades.filter(t => (parseFloat(t['Net P&L']) || 0) <= 0).length;

  state.charts.winLoss = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Win', 'Loss'],
      datasets: [{
        data: [wins, losses],
        backgroundColor: ['rgba(0, 212, 170, 0.8)', 'rgba(255, 71, 87, 0.8)'],
        borderColor: ['rgba(0, 212, 170, 1)', 'rgba(255, 71, 87, 1)'],
        borderWidth: 1,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { family: 'Outfit', size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10
          }
        }
      }
    }
  });
}

function updateStrategyChart(trades) {
  const ctx = document.getElementById('strategyChart');
  if (state.charts.strategy) state.charts.strategy.destroy();

  const stratMap = {};
  trades.forEach(t => {
    const strat = t['Strategy'] || 'N/A';
    if (!stratMap[strat]) stratMap[strat] = 0;
    stratMap[strat] += parseFloat(t['Net P&L']) || 0;
  });

  const labels = Object.keys(stratMap);
  const data = Object.values(stratMap);
  const colors = data.map(v => v >= 0 ? 'rgba(0, 212, 170, 0.75)' : 'rgba(255, 71, 87, 0.75)');

  state.charts.strategy = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net P&L by Strategy',
        data,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      ...chartDefaultOptions,
      indexAxis: 'y',
      plugins: {
        ...chartDefaultOptions.plugins,
        legend: { display: false }
      }
    }
  });
}

function updateSymbolChart(trades) {
  const ctx = document.getElementById('symbolChart');
  if (state.charts.symbol) state.charts.symbol.destroy();

  const symbolMap = {};
  trades.forEach(t => {
    const sym = t['Symbol'] || 'N/A';
    if (!symbolMap[sym]) symbolMap[sym] = 0;
    symbolMap[sym] += parseFloat(t['Net P&L']) || 0;
  });

  const labels = Object.keys(symbolMap);
  const data = Object.values(symbolMap);
  const bgColors = [
    'rgba(124, 92, 252, 0.7)',
    'rgba(0, 212, 170, 0.7)',
    'rgba(78, 140, 255, 0.7)',
    'rgba(255, 159, 67, 0.7)',
    'rgba(0, 206, 201, 0.7)',
    'rgba(254, 202, 87, 0.7)'
  ];

  state.charts.symbol = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors.slice(0, labels.length),
        borderWidth: 1,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { family: 'Outfit', size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10
          }
        }
      }
    }
  });
}

// ——————————— Tables ———————————
function renderRecentTrades(trades) {
  const tbody = document.getElementById('recentTradesBody');
  const sorted = [...trades].sort((a, b) => new Date(b['Date']) - new Date(a['Date']));
  const recent = sorted.slice(0, 10);

  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">ยังไม่มีข้อมูล</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(t => {
    const netPnl = parseFloat(t['Net P&L']) || 0;
    const pnlClass = netPnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const sideClass = t['Side'] === 'Long' ? 'side-long' : 'side-short';
    return `
      <tr>
        <td>${t['Date']}</td>
        <td><strong>${t['Symbol']}</strong></td>
        <td class="${sideClass}">${t['Side']}</td>
        <td>${formatPrice(t['Entry Price'])}</td>
        <td>${formatPrice(t['Exit Price'])}</td>
        <td>${t['Contracts']}</td>
        <td class="${pnlClass}">฿${formatNumber(netPnl)}</td>
      </tr>
    `;
  }).join('');
}

function renderAllTrades() {
  const tbody = document.getElementById('allTradesBody');
  let trades = [...state.trades];

  // Search filter
  const search = (document.getElementById('tradeSearch')?.value || '').toLowerCase();
  if (search) {
    trades = trades.filter(t =>
      (t['Symbol'] || '').toLowerCase().includes(search) ||
      (t['Strategy'] || '').toLowerCase().includes(search) ||
      (t['Side'] || '').toLowerCase().includes(search) ||
      (t['Date'] || '').includes(search) ||
      (t['Notes'] || '').toLowerCase().includes(search)
    );
  }

  // Sort
  trades.sort((a, b) => {
    let va = a[state.sortColumn];
    let vb = b[state.sortColumn];

    if (['Net P&L', 'Entry Price', 'Exit Price', 'P&L (Points)', 'P&L (Baht)'].includes(state.sortColumn)) {
      va = parseFloat(va) || 0;
      vb = parseFloat(vb) || 0;
    } else if (state.sortColumn === 'Date') {
      va = new Date(va);
      vb = new Date(vb);
    }

    if (va < vb) return state.sortDirection === 'asc' ? -1 : 1;
    if (va > vb) return state.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  if (trades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">ยังไม่มีข้อมูล</td></tr>';
    return;
  }

  tbody.innerHTML = trades.map(t => {
    const netPnl = parseFloat(t['Net P&L']) || 0;
    const pnlClass = netPnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const sideClass = t['Side'] === 'Long' ? 'side-long' : 'side-short';
    return `
      <tr>
        <td>${t['Date']}</td>
        <td><strong>${t['Symbol']}</strong></td>
        <td class="${sideClass}">${t['Side']}</td>
        <td>${formatPrice(t['Entry Price'])}</td>
        <td>${formatPrice(t['Exit Price'])}</td>
        <td>${t['Contracts']}</td>
        <td class="${pnlClass}">฿${formatNumber(netPnl)}</td>
        <td>${t['Strategy'] || '—'}</td>
        <td>
          <button class="delete-btn" onclick="deleteTradeById('${t['ID']}')" title="ลบ">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function initSortable() {
  document.querySelectorAll('.data-table thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.sortColumn === col) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = col;
        state.sortDirection = 'desc';
      }
      renderAllTrades();
    });
  });

  // Search input
  const searchInput = document.getElementById('tradeSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderAllTrades());
  }

  // Dashboard filter
  document.getElementById('dashboardFilter').addEventListener('change', () => updateDashboard());

  // Export CSV
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
}

// ——————————— Export CSV ———————————
function exportCsv() {
  if (state.trades.length === 0) {
    showToast('ไม่มีข้อมูลสำหรับ export', 'info');
    return;
  }

  const headers = ['Date', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Contracts',
    'P&L (Points)', 'P&L (Baht)', 'Commission', 'Net P&L', 'Strategy', 'Notes'];

  const rows = state.trades.map(t => headers.map(h => {
    const v = t[h] || '';
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `tfex_trades_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);

  showToast('Export CSV สำเร็จ', 'success');
}

// ——————————— Utilities ———————————
function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPrice(price) {
  const n = parseFloat(price);
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const iconMap = {
    success: 'check-circle',
    error: 'alert-circle',
    info: 'info'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${iconMap[type]}"></i> ${message}`;
  container.appendChild(toast);
  lucide.createIcons();

  const duration = type === 'error' ? 4500 : 3500;
  setTimeout(() => {
    toast.remove();
  }, duration);
}

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (show) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
}
