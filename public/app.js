// ------- starfield background -------
(function starfield(){
  const c = document.getElementById("bg");
  const ctx = c.getContext("2d");
  const resize = ()=>{ c.width = innerWidth; c.height = innerHeight; };
  resize(); addEventListener("resize", resize);
  const N = 140;
  const stars = [...Array(N)].map(()=>({
    x: Math.random()*c.width, y: Math.random()*c.height,
    r: Math.random()*1.8+0.6, vx:(Math.random()-.5)*0.22, vy:(Math.random()-.5)*0.22
  }));
  (function tick(){
    ctx.clearRect(0,0,c.width,c.height);
    for(const s of stars){
      s.x+=s.vx; s.y+=s.vy;
      if(s.x<0||s.x>c.width) s.vx*=-1;
      if(s.y<0||s.y>c.height) s.vy*=-1;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle="rgba(255,255,255,.85)"; ctx.fill();
    }
    requestAnimationFrame(tick);
  })();
})();

// ------- helpers -------
const $  = (q)=>document.querySelector(q);
const esc = (s)=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const shuffle = (arr)=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
const mentions = (t)=> (String(t||"").match(/@[\w.]+/g) || []).length;
const handle = (u)=> String(u||"").trim().replace(/^@+/,"").toLowerCase();

// ------- state -------
let data = [];      // { username, comment }
let pool = [];      // filtered + dedup + blacklist removed
let winners = [];   // 5 gacha
let BLACKLIST = new Set();

const statusEl = $("#status");
const ticker = $("#ticker");
const result = $("#result");
const startBtn = $("#startBtn");
const winnersList = $("#winnersList");

// ------- load blacklist (txt, optional csv) -------
async function loadBlacklist(){
  const list = new Set();

  // TXT: one username per line
  try{
    const r = await fetch("data/blacklist.txt", {cache:"no-store"});
    if (r.ok){
      const txt = await r.text();
      txt.split(/\r?\n/).forEach(line=>{
        const u = handle(line);
        if(u) list.add(u);
      });
    }
  }catch{ /* ignore */ }

  // CSV (ixtiyoriy): username ustuni bo‘lsa
  try{
    const r = await fetch("data/blacklist.csv", {cache:"no-store"});
    if (r.ok){
      const text = await r.text();
      await new Promise((resolve)=>{
        Papa.parse(text, {
          header:true, skipEmptyLines:true,
          complete:(res)=>{
            const cols = res.meta.fields || [];
            const map = cols.map(c=>c.toLowerCase().trim());
            const idx = map.indexOf("username");
            if(idx>=0){
              const col = cols[idx];
              res.data.forEach(row=>{
                const u = handle(row[col]);
                if(u) list.add(u);
              });
            }
            resolve();
          }
        });
      });
    }
  }catch{ /* ignore */ }

  // qo‘shimcha — agar kod ichida ham belgilamoqchi bo‘lsangiz
  const hardcoded = [
    // 'example_user'
  ];
  hardcoded.forEach(u=>list.add(handle(u)));

  BLACKLIST = list;
}

// ------- CSV load from public/data/comments.csv -------
async function loadCSV(){
  if (statusEl) statusEl.textContent = "";

  // avval blacklistni yuklab olaylik
  await loadBlacklist();

  Papa.parse("data/comments.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: res => {
      const cols = res.meta.fields || [];
      const pickCol = (cands) => {
        const map = cols.map(c=>c.toLowerCase().trim());
        for(const c of cands){ const i = map.indexOf(c); if(i>=0) return cols[i]; }
        return cols.find(c => cands.some(cc => c.toLowerCase().includes(cc))) || null;
      };
      const uCol = pickCol(["username","user_name","name","user","ig_username"]);
      const cCol = pickCol(["comment","comment_text","text","message","body"]);
      if(!uCol || !cCol){ if(statusEl) statusEl.textContent="CSV ustunlari topilmadi (username, comment)."; return; }

      data = res.data.map(r => ({
        username: (r[uCol]||"").toString().trim(),
        comment:  (r[cCol]||"").toString().trim(),
      })).filter(r => r.username);

      // ≥1 mention
      const filtered = data.filter(r => mentions(r.comment) >= 1);

      // dedupe by username
      const seen = new Set();
      const dedup = [];
      for(const r of filtered){
        const k = handle(r.username);
        if(!seen.has(k)){ seen.add(k); dedup.push(r); }
      }

      // BLACKLIST ni olib tashlaymiz
      const before = dedup.length;
      pool = dedup.filter(r => !BLACKLIST.has(handle(r.username)));
      const removed = before - pool.length;

      if(statusEl) statusEl.textContent =
        // `: ${data.length} • @ bilan ${filtered.length} • noyob ${before} • blacklisted −${removed} ⇒ tanlov: ${pool.length}`;

      startBtn.disabled = pool.length === 0;
      updateButtonLabel();
    },
    error: err => { console.error(err); if(statusEl) statusEl.textContent="CSV o‘qishda xatolik."; }
  });
}
document.addEventListener("DOMContentLoaded", loadCSV);

// ------- UI helpers -------
function updateButtonLabel(){
  const left = Math.max(0, 5 - winners.length);
  startBtn.querySelector(".text").textContent =
    left ? `Pick Winner (${winners.length+1}/5)` : "Done ✅";
  startBtn.disabled = !left || pool.length===0;
}

function appendWinnerToList(w){
  const li = document.createElement("li");
  li.innerHTML = `
    <div class="winner-username">@${esc(w.username)}</div>
    <div class="winner-comment">${esc(w.comment)}</div>
  `;
  winnersList.appendChild(li);
}

// ------- main flow (one click -> one new winner) -------
startBtn.addEventListener("click", async () => {
  if (!pool.length || winners.length >= 5) return;

  startBtn.disabled = true;
  result.classList.add("hidden");
  ticker.classList.remove("hidden");
  ticker.classList.add("zoom");

  // Sekinroq shuffle: 7s / 250ms
  const shuffled = shuffle(pool);
  const durationMs = 7000;
  const stepMs = 250;
  let i = 0;

  const intervalId = setInterval(() => {
    const r1 = shuffled[(i)   % shuffled.length];
    const r2 = shuffled[(i+1) % shuffled.length];
    const r3 = shuffled[(i+2) % shuffled.length];

    ticker.innerHTML = `
      <div class="ticker-box">
        <div class="ticker-list">
          <div class="tline">
            <span class="handle">@${esc(r1.username)}</span>
            <span class="preview">${esc(r1.comment)}</span>
          </div>
          <div class="tline">
            <span class="handle">@${esc(r2.username)}</span>
            <span class="preview">${esc(r2.comment)}</span>
          </div>
          <div class="tline">
            <span class="handle">@${esc(r3.username)}</span>
            <span class="preview">${esc(r3.comment)}</span>
          </div>
        </div>
      </div>
    `;
    i++;
  }, stepMs);

  await new Promise(r => setTimeout(r, durationMs));
  clearInterval(intervalId);

  // Winner (takrorlanmasin)
  const idx = Math.floor(Math.random() * pool.length);
  const winner = pool.splice(idx, 1)[0];

  winners.push(winner);
  confetti({ particleCount: 200, spread: 70, origin: { y: 0.4 } });

  result.innerHTML = `
    <div class="card">
      <div class="user">@${esc(winner.username)}</div>
      <div class="comment">${esc(winner.comment)}</div>
    </div>
  `;
  ticker.classList.add("hidden");
  ticker.classList.remove("zoom");
  result.classList.remove("hidden");

  appendWinnerToList(winner);
  updateButtonLabel();

  await new Promise(r => setTimeout(r, 800));
  startBtn.disabled = winners.length >= 5 || pool.length===0;
});
