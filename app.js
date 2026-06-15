// ── Storage ──
const Storage = {
  getRounds: () => JSON.parse(localStorage.getItem('golf_rounds') || '[]'),
  saveRounds: (r) => localStorage.setItem('golf_rounds', JSON.stringify(r)),
  getDraft: () => JSON.parse(localStorage.getItem('golf_draft') || 'null'),
  saveDraft: (d) => localStorage.setItem('golf_draft', JSON.stringify(d)),
  clearDraft: () => localStorage.removeItem('golf_draft'),
};

// ── Constants ──
const LIE_LABELS = { tee:'ティー', fairway:'FW', rough:'ラフ', bunker:'バンカー', around:'グリーン周り', ob:'OB' };
const DIR_ICON = { 'far-left':'↙', left:'↖', straight:'↑', right:'↗', 'far-right':'↘' };
const DIR_LABEL = { 'far-left':'左', left:'やや左', straight:'まっすぐ', right:'やや右', 'far-right':'右' };

const PRESETS = {
  standard:        { name: '標準',           pars: [4,4,3,4,4,3,4,5,4,4,4,3,4,4,5,3,4,5] },
  all4:            { name: '全Par4',         pars: Array(18).fill(4) },
  'regent-old':    { name: '札幌リージェント 旧コース',      pars: [5,4,3,4,4,4,3,4,5,4,4,5,3,4,4,5,3,4] },
  'regent-new':    { name: '札幌リージェント 新コース',      pars: [5,4,3,4,5,4,4,3,4,5,4,4,3,4,5,4,3,4] },
  'regent-thomson':{ name: '札幌リージェント トムソンコース', pars: [4,4,4,5,3,4,5,3,4,4,3,5,4,5,3,4,4,4] },
};

// ── App State ──
let draft = null;
let holeIndex = 0;
let currentLie = null;
let currentClub = null;
let currentDirection = null;
let charts = {};
let setupPars = [...PRESETS.standard.pars];
let gpsA = null, gpsB = null;
let editingShotIndex = null;
let editLie = null, editClub = null, editDirection = null;

// ── Screen Router ──
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'setup') initSetup();
  if (name === 'hole') renderHole();
  if (name === 'analysis') renderAnalysis();
}

// ── Home ──
function renderHome() {
  const rounds = Storage.getRounds();
  const list = document.getElementById('round-list');
  const empty = document.getElementById('no-rounds');
  const banner = document.getElementById('resume-banner');

  banner.style.display = Storage.getDraft() ? 'flex' : 'none';

  if (rounds.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    list.innerHTML = rounds.slice().reverse().map((r, revIdx) => {
      const origIdx = rounds.length - 1 - revIdx;
      const score = totalScore(r);
      const par = r.pars.reduce((a,b) => a+b, 0);
      const diff = score - par;
      const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
      return `<div class="round-item">
        <div>
          <div class="round-date">${fmtDate(r.date)}</div>
          <div class="round-sub">${r.courseName || 'コース未設定'} · ${diffStr}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="round-score">${score}</div>
          <button class="btn-del-round" onclick="deleteRound(${origIdx}, event)">🗑</button>
        </div>
      </div>`;
    }).join('');
  }
}

function deleteRound(idx, e) {
  e.stopPropagation();
  if (confirm('このラウンドを削除しますか？')) {
    const rounds = Storage.getRounds();
    rounds.splice(idx, 1);
    Storage.saveRounds(rounds);
    renderHome();
  }
}

function resumeDraft() {
  draft = Storage.getDraft();
  holeIndex = draft.currentHoleIndex || 0;
  showScreen('hole');
}

function discardDraft() {
  if (confirm('中断中のラウンドを破棄しますか？')) {
    Storage.clearDraft();
    renderHome();
  }
}

// ── Setup ──
function initSetup() {
  document.getElementById('input-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('input-course').value = '';
  renderParGrid();
}

function setParPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  setupPars = [...preset.pars];
  // コース名も自動入力（リージェント系のみ）
  if (key.startsWith('regent-')) {
    document.getElementById('input-course').value = preset.name;
  }
  renderParGrid();
}

function renderParGrid() {
  document.getElementById('par-grid').innerHTML = setupPars.map((p, i) => `
    <div class="par-cell" onclick="cyclePar(${i})">
      <div class="par-cell-num">${i+1}</div>
      <div class="par-cell-val">${p}</div>
    </div>`).join('');
}

function cyclePar(i) {
  setupPars[i] = setupPars[i] === 3 ? 4 : setupPars[i] === 4 ? 5 : 3;
  renderParGrid();
}

function startRound() {
  draft = {
    id: Date.now().toString(),
    date: document.getElementById('input-date').value,
    courseName: document.getElementById('input-course').value,
    pars: [...setupPars],
    holes: Array(18).fill(null).map((_, i) => ({
      holeNumber: i + 1,
      par: setupPars[i],
      shots: [],
      putts: 0,
    })),
    currentHoleIndex: 0,
  };

  if (draft.courseName === 'テスト') {
    generateTestData();
    const rounds = Storage.getRounds();
    rounds.push(draft);
    Storage.saveRounds(rounds);
    draft = null;
    showScreen('home');
    return;
  }

  holeIndex = 0;
  Storage.saveDraft(draft);
  showScreen('hole');
}

function generateTestData() {
  const WOODS = ['1W', '3W', '5W', 'UT'];
  const IRONS = ['5I', '6I', '7I', '8I', '9I', 'PW'];
  const APPROACH = ['PW', 'AW', 'SW'];
  const MID = ['3W', '5W', 'UT', '5I', '6I', '7I', '8I'];
  const DIRS = ['far-left', 'left', 'straight', 'straight', 'straight', 'right', 'far-right'];
  const LIES = ['fairway', 'fairway', 'rough', 'rough', 'bunker', 'around'];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  draft.holes.forEach(hole => {
    const diff = Math.floor(Math.random() * 6) - 1; // -1〜+4
    const score = Math.max(2, hole.par + diff);
    const putts = Math.min(Math.floor(Math.random() * 3) + 1, score - 1); // 1〜3、ショット最低1本確保
    const numShots = score - putts;

    hole.putts = putts;
    hole.shots = Array(numShots).fill(null).map((_, i) => {
      if (i === 0) {
        // 1打目：ティーショット
        return {
          lie: 'tee',
          club: hole.par === 3 ? pick(IRONS) : pick(WOODS),
          direction: pick(DIRS),
          distance: null,
        };
      } else if (i === numShots - 1 && numShots > 1) {
        // 最終ショット：アプローチ
        return {
          lie: pick(['fairway', 'around', 'around']),
          club: pick(APPROACH),
          direction: pick(DIRS),
          distance: null,
        };
      } else {
        // 中間ショット
        return {
          lie: pick(LIES),
          club: pick(MID),
          direction: pick(DIRS),
          distance: null,
        };
      }
    });
  });
}

// ── Hole ──
function renderHole() {
  if (!draft) return;
  const hole = draft.holes[holeIndex];
  const isLast = holeIndex === 17;

  document.getElementById('hole-title').textContent = `ホール ${hole.holeNumber}`;
  document.getElementById('hole-progress').textContent = `${holeIndex + 1} / 18`;
  document.getElementById('hole-par-display').textContent = `Par ${hole.par}`;
  document.getElementById('next-hole-btn').textContent = isLast ? 'ラウンド終了' : '次のホールへ';
  document.getElementById('putts-display').textContent = hole.putts;

  const score = hole.shots.length + hole.putts;
  const scoreEl = document.getElementById('hole-score-display');
  const vsParEl = document.getElementById('hole-vs-par-display');
  if (score > 0) {
    scoreEl.textContent = score;
    const diff = score - hole.par;
    vsParEl.textContent = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
    vsParEl.style.color = diff < 0 ? 'var(--green)' : diff === 0 ? 'var(--label)' : 'var(--red)';
  } else {
    scoreEl.textContent = '—';
    vsParEl.textContent = '—';
    vsParEl.style.color = '';
  }

  const shotList = document.getElementById('shot-list');
  shotList.innerHTML = hole.shots.length === 0 ? '' : hole.shots.map((s, i) => `
    <div class="shot-item">
      <span class="shot-num">${i+1}</span>
      <span class="shot-lie">${LIE_LABELS[s.lie]}</span>
      ${s.club ? `<span class="shot-club">${s.club}</span>` : ''}
      ${s.distance ? `<span class="shot-dist">${s.distance}yd</span>` : ''}
      ${s.direction ? `<span class="shot-dir">${DIR_ICON[s.direction]}</span>` : ''}
      <div class="shot-actions">
        <button class="shot-edit" onclick="openEditShot(${i})">✏️</button>
        <button class="shot-del" onclick="removeShot(${i})">×</button>
      </div>
    </div>`).join('');

  updateGPSApplyButtons();

  document.getElementById('hole-quit-btn').onclick = () => {
    if (confirm('ラウンドを中断しますか？（データは保存されます）')) {
      Storage.saveDraft(draft);
      showScreen('home');
    }
  };
}

function removeShot(i) {
  draft.holes[holeIndex].shots.splice(i, 1);
  Storage.saveDraft(draft);
  renderHole();
}

function changePutts(delta) {
  draft.holes[holeIndex].putts = Math.max(0, draft.holes[holeIndex].putts + delta);
  Storage.saveDraft(draft);
  renderHole();
}

function nextHole() {
  resetGPS();
  if (holeIndex === 17) {
    Storage.saveDraft(draft);
    renderComplete();
    showScreen('complete');
  } else {
    holeIndex++;
    draft.currentHoleIndex = holeIndex;
    Storage.saveDraft(draft);
    renderHole();
  }
}

// ── GPS Distance ──
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function markGPS(point) {
  if (!navigator.geolocation) {
    alert('このブラウザは位置情報に対応していません');
    return;
  }
  const btn = document.getElementById('btn-gps-' + point);
  btn.textContent = '取得中…';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (point === 'a') {
      gpsA = coords;
      btn.textContent = '✅ 打つ前';
    } else {
      gpsB = coords;
      btn.textContent = '✅ ボール地点';
    }
    btn.disabled = false;
    btn.classList.add('marked');
    if (gpsA && gpsB) {
      const yards = Math.round(haversine(gpsA.lat, gpsA.lng, gpsB.lat, gpsB.lng) * 1.09361);
      document.getElementById('distance-result').textContent = yards + ' yd';
      updateGPSApplyButtons();
    }
  }, () => {
    btn.textContent = point === 'a' ? '📍 打つ前' : '📍 ボール地点';
    btn.disabled = false;
    alert('位置情報の取得に失敗しました。\n設定で位置情報を許可してください。');
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function resetGPS() {
  gpsA = null; gpsB = null;
  const btnA = document.getElementById('btn-gps-a');
  const btnB = document.getElementById('btn-gps-b');
  if (btnA) { btnA.textContent = '📍 打つ前'; btnA.classList.remove('marked'); btnA.disabled = false; }
  if (btnB) { btnB.textContent = '📍 ボール地点'; btnB.classList.remove('marked'); btnB.disabled = false; }
  const res = document.getElementById('distance-result');
  if (res) res.textContent = '— yd';
  const area = document.getElementById('gps-apply-area');
  if (area) area.innerHTML = '';
}

function updateGPSApplyButtons() {
  const area = document.getElementById('gps-apply-area');
  if (!area) return;
  if (!gpsA || !gpsB || !draft || draft.holes[holeIndex].shots.length === 0) {
    area.innerHTML = '';
    return;
  }
  const shots = draft.holes[holeIndex].shots;
  area.innerHTML = '<div class="gps-apply-label">ショットに反映</div>' +
    shots.map((s, i) => `
      <button class="btn-apply-gps" onclick="applyGPSToShot(${i})">
        ショット${i+1}（${LIE_LABELS[s.lie]}）に反映
      </button>`).join('');
}

function applyGPSToShot(i) {
  if (!gpsA || !gpsB) return;
  const yards = Math.round(haversine(gpsA.lat, gpsA.lng, gpsB.lat, gpsB.lng) * 1.09361);
  draft.holes[holeIndex].shots[i].distance = yards;
  Storage.saveDraft(draft);
  renderHole();
}

// ── Lie → Club → Direction → Distance ──
function selectLie(lie) {
  currentLie = lie;
  if (lie === 'ob') {
    draft.holes[holeIndex].shots.push({ lie, club: null, direction: null, distance: null });
    Storage.saveDraft(draft);
    showScreen('hole');
  } else {
    showScreen('club');
  }
}

function selectClub(club) {
  currentClub = club;
  showScreen('direction');
}

function selectDirection(dir) {
  currentDirection = dir;
  document.getElementById('input-distance').value = '';
  showScreen('distance');
}

function saveShot(skip) {
  const val = document.getElementById('input-distance').value;
  const distance = skip || !val ? null : parseInt(val);
  draft.holes[holeIndex].shots.push({ lie: currentLie, club: currentClub, direction: currentDirection, distance });
  Storage.saveDraft(draft);
  showScreen('hole');
}

// ── Complete ──
function totalScore(round) {
  return round.holes.reduce((sum, h) => sum + h.shots.length + h.putts, 0);
}

function calcStats(round) {
  let gir=0, putts=0, birdie=0, par=0, bogey=0, dbl=0;
  round.holes.forEach(h => {
    const score = h.shots.length + h.putts;
    const diff = score - h.par;
    putts += h.putts;
    if (h.shots.length > 0 && h.shots.length <= h.par - 2) gir++;
    if (diff <= -1) birdie++;
    else if (diff === 0) par++;
    else if (diff === 1) bogey++;
    else dbl++;
  });
  return {
    gir: Math.round(gir / 18 * 100),
    avgPutts: (putts / 18).toFixed(1),
    birdie, par, bogey, dbl,
  };
}

function renderComplete() {
  const score = totalScore(draft);
  const totalPar = draft.pars.reduce((a,b) => a+b, 0);
  const diff = score - totalPar;
  const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;

  document.getElementById('complete-score').textContent = score;
  document.getElementById('complete-vs-par').textContent = diffStr;
  document.getElementById('complete-course').textContent = draft.courseName || '';

  const s = calcStats(draft);
  document.getElementById('complete-stats').innerHTML = `
    <div class="stat-row"><span class="stat-label">パーオン率</span><span class="stat-value">${s.gir}%</span></div>
    <div class="stat-row"><span class="stat-label">平均パット数</span><span class="stat-value">${s.avgPutts}</span></div>
    <div class="stat-row"><span class="stat-label">バーディ以下</span><span class="stat-value">${s.birdie} ホール</span></div>
    <div class="stat-row"><span class="stat-label">パー</span><span class="stat-value">${s.par} ホール</span></div>
    <div class="stat-row"><span class="stat-label">ボギー</span><span class="stat-value">${s.bogey} ホール</span></div>
    <div class="stat-row"><span class="stat-label">ダブルボギー以上</span><span class="stat-value">${s.dbl} ホール</span></div>`;
}

function saveRound() {
  const rounds = Storage.getRounds();
  rounds.push(draft);
  Storage.saveRounds(rounds);
  Storage.clearDraft();
  draft = null;
  showScreen('home');
}

function discardRound() {
  if (confirm('このラウンドを破棄しますか？')) {
    Storage.clearDraft();
    draft = null;
    showScreen('home');
  }
}

// ── Analysis ──
function renderAnalysis() {
  const rounds = Storage.getRounds();
  const noData = document.getElementById('no-analysis');
  const content = document.getElementById('analysis-content');

  if (rounds.length === 0) {
    noData.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  noData.style.display = 'none';
  content.style.display = 'block';

  const allHoles = rounds.flatMap(r => r.holes);
  const allShots = allHoles.flatMap(h => h.shots);

  const scores = rounds.map(r => totalScore(r));
  const pars = rounds.map(r => r.pars.reduce((a,b)=>a+b,0));
  let totalGir=0, totalPutts=0, birdie=0, par=0, bogey=0, dbl=0;
  allHoles.forEach(h => {
    const score = h.shots.length + h.putts;
    const diff = score - h.par;
    totalPutts += h.putts;
    if (h.shots.length > 0 && h.shots.length <= h.par - 2) totalGir++;
    if (diff <= -1) birdie++;
    else if (diff === 0) par++;
    else if (diff === 1) bogey++;
    else dbl++;
  });
  const n = allHoles.length;
  const avgScore = (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1);
  const bestScore = Math.min(...scores);
  const avgDiff = (scores.map((s,i)=>s-pars[i]).reduce((a,b)=>a+b,0)/scores.length).toFixed(1);

  document.getElementById('overall-stats').innerHTML = `
    <div class="stat-row"><span class="stat-label">ラウンド数</span><span class="stat-value">${rounds.length}</span></div>
    <div class="stat-row"><span class="stat-label">平均スコア</span><span class="stat-value">${avgScore} (${Number(avgDiff)>0?'+':''}${avgDiff})</span></div>
    <div class="stat-row"><span class="stat-label">ベストスコア</span><span class="stat-value">${bestScore}</span></div>
    <div class="stat-row"><span class="stat-label">パーオン率</span><span class="stat-value">${Math.round(totalGir/n*100)}%</span></div>
    <div class="stat-row"><span class="stat-label">平均パット数</span><span class="stat-value">${(totalPutts/n).toFixed(1)}</span></div>`;

  renderScoreDistChart(birdie, par, bogey, dbl);
  renderDirectionChart(allShots);
  renderMissTable(allShots);

  document.getElementById('analysis-round-list').innerHTML = rounds.slice().reverse().map((r, revIdx) => {
    const origIdx = rounds.length - 1 - revIdx;
    const score = totalScore(r);
    const p = r.pars.reduce((a,b)=>a+b,0);
    const diff = score - p;
    const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
    return `<div class="round-item">
      <div>
        <div class="round-date">${fmtDate(r.date)}</div>
        <div class="round-sub">${r.courseName || 'コース未設定'} · ${diffStr}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="round-score">${score}</div>
        <button class="btn-del-round" onclick="deleteRound(${origIdx}, event)">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function renderScoreDistChart(birdie, par, bogey, dbl) {
  if (charts.scoreDist) charts.scoreDist.destroy();
  charts.scoreDist = new Chart(
    document.getElementById('score-dist-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['バーディ以下', 'パー', 'ボギー', 'ダブル以上'],
      datasets: [{ data: [birdie, par, bogey, dbl],
        backgroundColor: ['#34C759','#007AFF','#FF9500','#FF3B30'],
        borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function renderDirectionChart(shots) {
  const keys = ['far-left','left','straight','right','far-right'];
  const counts = Object.fromEntries(keys.map(k => [k, 0]));
  shots.filter(s => s.direction).forEach(s => { if (counts[s.direction] !== undefined) counts[s.direction]++; });

  if (charts.direction) charts.direction.destroy();
  charts.direction = new Chart(
    document.getElementById('direction-chart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: keys.map(k => DIR_LABEL[k]),
      datasets: [{ data: keys.map(k => counts[k]),
        backgroundColor: ['#FF3B30','#FF9500','#34C759','#FF9500','#FF3B30'],
        borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { padding: 14, font: { size: 13 } } } },
    },
  });
}

function renderMissTable(shots) {
  const lies = ['tee','fairway','rough','bunker','around'];
  const dirs = ['far-left','left','straight','right','far-right'];
  const matrix = {};
  lies.forEach(l => { matrix[l] = {}; dirs.forEach(d => matrix[l][d] = 0); });
  shots.filter(s => s.direction && matrix[s.lie]).forEach(s => { matrix[s.lie][s.direction]++; });

  document.getElementById('miss-pattern-table').innerHTML = `<table class="miss-table">
    <thead><tr>
      <th class="miss-td-label">ライ</th>
      ${dirs.map(d => `<th>${DIR_ICON[d]}<br><small>${DIR_LABEL[d]}</small></th>`).join('')}
    </tr></thead>
    <tbody>
      ${lies.map(l => {
        const row = matrix[l];
        const total = Object.values(row).reduce((a,b)=>a+b,0);
        const maxV = Math.max(...Object.values(row));
        return `<tr>
          <td class="miss-td-label">${LIE_LABELS[l]}</td>
          ${dirs.map(d => {
            const v = row[d];
            const pct = total > 0 ? Math.round(v/total*100) : 0;
            const cls = v > 0 && v === maxV ? 'cell-high' : pct >= 30 ? 'cell-mid' : '';
            return `<td><span class="${cls}">${total > 0 ? pct+'%' : '—'}</span></td>`;
          }).join('')}
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

// ── Shot Edit ──
function openEditShot(i) {
  editingShotIndex = i;
  const s = draft.holes[holeIndex].shots[i];
  editLie = s.lie;
  editClub = s.club;
  editDirection = s.direction;
  document.getElementById('edit-distance').value = s.distance || '';
  renderEditShot();
  showScreen('edit-shot');
}

function renderEditShot() {
  document.querySelectorAll('.btn-edit-lie').forEach(btn => {
    btn.classList.toggle('edit-selected', btn.dataset.value === editLie);
  });
  document.querySelectorAll('.btn-edit-club').forEach(btn => {
    btn.classList.toggle('edit-selected', btn.dataset.value === editClub);
  });
  document.querySelectorAll('.btn-edit-dir').forEach(btn => {
    btn.classList.toggle('edit-selected', btn.dataset.value === editDirection);
  });
  const isOB = editLie === 'ob';
  document.getElementById('edit-club-section').style.display = isOB ? 'none' : '';
  document.getElementById('edit-dir-section').style.display = isOB ? 'none' : '';
}

function setEditLie(v) { editLie = v; renderEditShot(); }
function setEditClub(v) { editClub = v; renderEditShot(); }
function setEditDir(v) { editDirection = v; renderEditShot(); }

function updateShot() {
  const val = document.getElementById('edit-distance').value;
  const isOB = editLie === 'ob';
  draft.holes[holeIndex].shots[editingShotIndex] = {
    lie: editLie,
    club: isOB ? null : editClub,
    direction: isOB ? null : editDirection,
    distance: isOB || !val ? null : parseInt(val),
  };
  Storage.saveDraft(draft);
  showScreen('hole');
}

// ── Utils ──
function fmtDate(s) {
  const d = new Date(s);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => showScreen('home'));
