let historyChart = null;
let selectedRangeHours = 24;
let latestData = null;
let latestHistory = [];

const RANGE_LIMITS = {
    24: 300,
    168: 800,
    720: 1600
};

Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', sans-serif";

function initChart() {
    const ctx = document.getElementById('historyChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Nivel de Agua (%)',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointRadius: 2,
                pointHoverRadius: 5,
                fill: true,
                tension: 0.35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { maxTicksLimit: 8 }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        callback: value => `${value}%`
                    }
                }
            }
        }
    });
}

function parseDate(value) {
    return value ? new Date(value) : null;
}

function getHoursBetween(start, end) {
    return Math.max((end - start) / 36e5, 0);
}

function formatNumber(value, digits = 1) {
    if (!Number.isFinite(value)) {
        return '--';
    }
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: value % 1 === 0 ? 0 : digits,
        maximumFractionDigits: digits
    });
}

function formatElapsed(date) {
    if (!date || Number.isNaN(date.getTime())) {
        return 'sem leitura';
    }

    const seconds = Math.max(Math.floor((Date.now() - date.getTime()) / 1000), 0);
    if (seconds < 60) {
        return `ha ${seconds} segundos`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `ha ${minutes} minutos`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `ha ${hours} horas`;
    }

    const days = Math.floor(hours / 24);
    return `ha ${days} dias`;
}

function formatChartLabel(timestamp) {
    const date = parseDate(timestamp);
    if (!date) {
        return '--';
    }

    if (selectedRangeHours <= 24) {
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getReservoirStatus(percentual) {
    if (!Number.isFinite(percentual)) {
        return { label: 'Aguardando', className: 'waiting' };
    }
    if (percentual > 60) {
        return { label: 'Normal', className: 'normal' };
    }
    if (percentual >= 30) {
        return { label: 'Atencao', className: 'attention' };
    }
    return { label: 'Critico', className: 'critical' };
}

function getChronologicalHistory(history) {
    return [...history]
        .filter(item => item.timestamp)
        .sort((a, b) => parseDate(a.timestamp) - parseDate(b.timestamp));
}

function calculateConsumption(history) {
    const ordered = getChronologicalHistory(history);
    let consumedLiters = 0;
    let consumptionHours = 0;
    let latestRate = null;

    for (let i = 1; i < ordered.length; i += 1) {
        const previous = ordered[i - 1];
        const current = ordered[i];
        const previousDate = parseDate(previous.timestamp);
        const currentDate = parseDate(current.timestamp);
        const hours = getHoursBetween(previousDate, currentDate);
        const previousVolume = Number(previous.volume_litros);
        const currentVolume = Number(current.volume_litros);

        if (hours <= 0 || !Number.isFinite(previousVolume) || !Number.isFinite(currentVolume)) {
            continue;
        }

        const delta = previousVolume - currentVolume;
        latestRate = Math.max(delta, 0) / hours;

        if (delta > 0) {
            consumedLiters += delta;
            consumptionHours += hours;
        }
    }

    if (consumedLiters <= 0 || consumptionHours <= 0) {
        return { average: null, latestRate };
    }

    return {
        average: consumedLiters / consumptionHours,
        latestRate
    };
}

function calculateTrend(history) {
    const ordered = getChronologicalHistory(history);
    if (ordered.length < 2) {
        return { rate: null, label: 'Aguardando historico', className: 'waiting' };
    }

    const recent = ordered.slice(-12);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const firstDate = parseDate(first.timestamp);
    const lastDate = parseDate(last.timestamp);
    const hours = getHoursBetween(firstDate, lastDate);

    if (hours <= 0) {
        return { rate: null, label: 'Aguardando historico', className: 'waiting' };
    }

    const rate = (Number(last.percentual) - Number(first.percentual)) / hours;
    if (!Number.isFinite(rate)) {
        return { rate: null, label: 'Aguardando historico', className: 'waiting' };
    }

    if (rate < -0.1) {
        return {
            rate,
            label: `Caindo ${formatNumber(Math.abs(rate), 1)}% por hora`,
            className: 'falling'
        };
    }

    if (rate > 0.1) {
        return {
            rate,
            label: `Enchendo ${formatNumber(rate, 1)}% por hora`,
            className: 'rising'
        };
    }

    return { rate, label: 'Estavel', className: 'stable' };
}

function getRemainingTime(latest, averageConsumption) {
    const volume = latest ? Number(latest.volume_litros) : NaN;
    if (!latest || !Number.isFinite(volume) || !averageConsumption || averageConsumption <= 0) {
        return 'Aguardando historico';
    }

    const hours = volume / averageConsumption;
    if (hours < 1) {
        return `${Math.max(Math.round(hours * 60), 1)} minutos`;
    }

    return `${Math.round(hours)} horas`;
}

function renderConnectionStatus(data) {
    const dot = document.getElementById('connection-status');
    const text = document.getElementById('connection-text');
    const timestamp = data ? parseDate(data.timestamp) : null;
    const minutesSince = timestamp ? (Date.now() - timestamp.getTime()) / 60000 : Infinity;

    dot.className = 'status-dot';

    if (!data) {
        dot.classList.add('connecting');
        text.textContent = 'Aguardando leitura';
        return;
    }

    if (minutesSince > 2) {
        dot.classList.add('error');
        text.textContent = `Sem comunicacao ${formatElapsed(timestamp)}`;
        return;
    }

    dot.classList.add('connected');
    text.textContent = `Atualizado ${formatElapsed(timestamp)}`;
}

function renderLatest(data) {
    if (!data || data.message) {
        latestData = null;
        renderConnectionStatus(null);
        return;
    }

    latestData = data;
    const percentual = Number(data.percentual) || 0;
    const status = getReservoirStatus(percentual);
    const nivelCm = Number(data.nivel_cm) || 0;
    const capacidadeCm = Number(data.capacidade_cm) || 0;
    const volume = Number(data.volume_litros) || 0;

    document.documentElement.style.setProperty('--nivel-agua', `${Math.min(Math.max(percentual, 0), 100)}%`);
    document.getElementById('level-percentage').textContent = `${percentual}%`;
    document.getElementById('level-absolute').textContent = `${formatNumber(nivelCm, 1)} / ${formatNumber(capacidadeCm, 1)} cm`;
    document.getElementById('volume-value').textContent = `${formatNumber(volume, 1)} L`;

    const reservoirState = document.getElementById('reservoir-state');
    reservoirState.innerHTML = `<span class="state-dot ${status.className}"></span><span>${status.label}</span>`;

    const pill = document.getElementById('reservoir-status-pill');
    pill.className = `status-pill ${status.className}`;
    pill.textContent = status.label;

    renderConnectionStatus(data);
}

function renderHistory(history) {
    latestHistory = history;
    const ordered = getChronologicalHistory(history);

    if (historyChart) {
        historyChart.data.labels = ordered.map(item => formatChartLabel(item.timestamp));
        historyChart.data.datasets[0].data = ordered.map(item => Number(item.percentual) || 0);
        historyChart.update();
    }

    const consumption = calculateConsumption(ordered);
    const trend = calculateTrend(ordered);

    document.getElementById('consumption-value').textContent = consumption.average
        ? `${formatNumber(consumption.average, 1)} L/h`
        : '-- L/h';
    document.getElementById('remaining-time-value').textContent = getRemainingTime(latestData, consumption.average);

    const trendValue = document.getElementById('trend-value');
    trendValue.textContent = trend.label;
    trendValue.className = `card-value compact trend-text ${trend.className}`;

    renderEvents(ordered);
    renderAlerts(latestData, ordered, consumption, trend);
}

function renderEvents(orderedHistory) {
    const container = document.getElementById('events-list');
    const events = [...orderedHistory].reverse().slice(0, 8);

    if (!events.length) {
        container.innerHTML = '<div class="empty-state">Aguardando leituras</div>';
        return;
    }

    container.innerHTML = events.map(item => {
        const date = parseDate(item.timestamp);
        const time = date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        return `
            <div class="event-row">
                <span>${time}</span>
                <strong>Nivel ${Number(item.percentual) || 0}%</strong>
            </div>
        `;
    }).join('');
}

function hasAbruptDrop(orderedHistory) {
    for (let i = Math.max(1, orderedHistory.length - 8); i < orderedHistory.length; i += 1) {
        const previous = orderedHistory[i - 1];
        const current = orderedHistory[i];
        const hours = getHoursBetween(parseDate(previous.timestamp), parseDate(current.timestamp));
        const drop = Number(previous.percentual) - Number(current.percentual);

        if (hours > 0 && hours <= 0.5 && drop >= 10) {
            return true;
        }
    }
    return false;
}

function buildAlerts(latest, orderedHistory, consumption) {
    const alerts = [];
    const latestDate = latest ? parseDate(latest.timestamp) : null;
    const minutesSince = latestDate ? (Date.now() - latestDate.getTime()) / 60000 : Infinity;
    const percentual = latest ? Number(latest.percentual) : NaN;

    if (Number.isFinite(percentual) && percentual < 30) {
        alerts.push({ type: 'critical', title: 'Nivel critico', message: 'Reservatorio abaixo de 30%.' });
    }

    if (!latest || minutesSince > 10) {
        alerts.push({
            type: 'critical',
            title: 'Sensor offline',
            message: latestDate ? `Sem comunicacao ${formatElapsed(latestDate)}.` : 'Nenhuma leitura recebida.'
        });
    }

    if (hasAbruptDrop(orderedHistory)) {
        alerts.push({ type: 'warning', title: 'Queda brusca de nivel', message: 'Reducao rapida detectada nas ultimas medicoes.' });
    }

    if (
        consumption.average &&
        consumption.latestRate &&
        consumption.latestRate > consumption.average * 1.4 &&
        consumption.latestRate > 0
    ) {
        alerts.push({
            type: 'warning',
            title: 'Consumo acima da media',
            message: `Ritmo atual em ${formatNumber(consumption.latestRate, 1)} L/h.`
        });
    }

    return alerts.slice(0, 5);
}

function renderAlerts(latest, orderedHistory, consumption) {
    const container = document.getElementById('alerts-container');
    const count = document.getElementById('alerts-count');
    const alerts = buildAlerts(latest, orderedHistory, consumption);

    count.textContent = `${alerts.length} ${alerts.length === 1 ? 'ativo' : 'ativos'}`;

    if (!alerts.length) {
        container.innerHTML = '<div class="empty-state">Nenhum alerta ativo</div>';
        return;
    }

    container.innerHTML = alerts.map(alert => `
        <div class="alert ${alert.type}">
            <span class="alert-symbol">!</span>
            <div>
                <strong>${alert.title}</strong>
                <span>${alert.message}</span>
            </div>
        </div>
    `).join('');
}

async function fetchLatestData() {
    const response = await fetch('/api/latest');
    if (response.status === 404) {
        renderLatest(null);
        return;
    }

    if (!response.ok) {
        throw new Error('Falha ao buscar leitura atual');
    }

    const data = await response.json();
    renderLatest(data);
}

async function fetchHistoryData() {
    const limit = RANGE_LIMITS[selectedRangeHours] || 500;
    const response = await fetch(`/api/history?hours=${selectedRangeHours}&limit=${limit}`);
    if (!response.ok) {
        throw new Error('Falha ao buscar historico');
    }

    const history = await response.json();
    renderHistory(history);
}

async function updateDashboard() {
    try {
        await fetchLatestData();
        await fetchHistoryData();
    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
        const dot = document.getElementById('connection-status');
        dot.className = 'status-dot error';
        document.getElementById('connection-text').textContent = 'Erro de conexao';
        renderAlerts(latestData, getChronologicalHistory(latestHistory), calculateConsumption(latestHistory));
    }
}

function bindRangeFilters() {
    document.querySelectorAll('.range-filter').forEach(button => {
        button.addEventListener('click', () => {
            selectedRangeHours = Number(button.dataset.hours);
            document.querySelectorAll('.range-filter').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            fetchHistoryData().catch(error => console.error('Erro ao trocar periodo:', error));
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    bindRangeFilters();
    updateDashboard();
    setInterval(updateDashboard, 5000);
});
