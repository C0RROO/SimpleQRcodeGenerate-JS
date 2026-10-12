function loadScript(urls){
  return new Promise((resolve,reject)=>{
    let i = 0;
    (function next(){
      if (i >= urls.length) return reject(new Error('CDN'));
      const s = document.createElement('script');
      s.src = urls[i++]; s.async = false;
      s.onload = () => resolve(); s.onerror = next;
      document.head.appendChild(s);
    })();
  });
}
const QR_CDNS = [
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
];
const SCAN_CDNS = [
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'
];
Promise.all([loadScript(QR_CDNS), loadScript(SCAN_CDNS).catch(()=>null)])
  .then(init)
  .catch(err=>{
    document.getElementById('loader').innerHTML =
      '<div style="text-align:center;padding:20px"><div style="color:#d47272;font-size:14px;font-weight:700">Не удалось загрузить QR</div><div style="color:#5f6572;font-size:12px;margin-top:6px">'+String(err.message||err)+'</div></div>';
  });

function init(){
'use strict';

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const deb = (fn,ms=120)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
const esc = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val = id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
const chk = id=>{const el=document.getElementById(id);return el?el.checked:false;};

let toastTimer;
function toast(msg){
  const el = $('#toast'); el.textContent = msg;
  el.className = 'toast show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.className = 'toast'; }, 2400);
}
function roundRect(ctx,x,y,w,h,r){
  r = Math.max(0,Math.min(r,w/2,h/2));
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function hexToRgb(h){
  h = String(h).replace('#','');
  if (h.length===3) h = h.split('').map(c=>c+c).join('');
  const n = parseInt(h,16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}
function relLum(hex){
  const [r,g,b] = hexToRgb(hex).map(c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);});
  return 0.2126*r+0.7152*g+0.0722*b;
}
function contrast(a,b){
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}
function mixHex(a,b){
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#'+[0,1,2].map(i=>Math.round((A[i]+B[i])/2).toString(16).padStart(2,'0')).join('');
}
function loadImage(src){
  return new Promise((res,rej)=>{
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = ()=>res(img); img.onerror = rej; img.src = src;
  });
}
function downloadURL(url,name){
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

(function(){
  const host = $('#bgParticles');
  const count = 42;
  for (let i=0;i<count;i++){
    const p = document.createElement('i');
    p.style.left = (Math.random()*100)+'%';
    p.style.animationDuration = (14 + Math.random()*26)+'s';
    p.style.animationDelay = (-Math.random()*40)+'s';
    p.style.opacity = (.2 + Math.random()*.5);
    const size = (1 + Math.random()*1.8).toFixed(1);
    p.style.width = size+'px';
    p.style.height = size+'px';
    host.appendChild(p);
  }
})();

const D = {
  fg:'#12151c', fg2:'#6b7688', bg:'#ffffff',
  gradient:false, angle:45, transparent:false,
  shape:'square', eyeShape:'square', eyeCustom:false, eyeColor:'#12151c',
  ecc:'M', margin:4, size:1024,
  frame:false, frameText:'SCAN ME', frameColor:'#12161f', frameTextColor:'#ffffff',
  logoScale:0.76, logoRadius:0.16
};
const state = { type:'url' };
let logoImg = null;
let logoDataUrl = null;
let current = { text:'', qr:null, size:0, canvas:null };
let buildAnim = null;
let lastTextKey = '';

const TYPE_LABELS = {url:'Ссылка',text:'Текст',wifi:'Wi-Fi',geo:'Гео',email:'E-mail',tel:'Телефон'};

const LOGO_ZONE_RATIO = 0.24;
const LOGO_CARD_RATIO = 0.22;

function isLogoZone(r, c, size){
  if (!logoImg) return false;
  const half = size * LOGO_ZONE_RATIO / 2;
  const center = size / 2;
  const mr = r + 0.5, mc = c + 0.5;
  return Math.abs(mr - center) < half && Math.abs(mc - center) < half;
}

const escWifi = s=>String(s).replace(/([\\;,:"])/g,'\\$1');
function buildContent(){
  switch(state.type){
    case 'text': return val('t_text');
    case 'url': { let u = val('t_url'); if (!u) return ''; if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://'+u; return u; }
    case 'wifi': {
      const ssid = val('w_ssid'); if (!ssid) return '';
      const enc = val('w_enc')||'WPA';
      let s = `WIFI:T:${enc};S:${escWifi(ssid)};`;
      if (enc!=='nopass') s += `P:${escWifi(val('w_pass'))};`;
      if (chk('w_hidden')) s += 'H:true;';
      return s+';';
    }
    case 'geo': { const a = val('g_lat'), b = val('g_lng'); return (a&&b)?`geo:${a},${b}`:''; }
    case 'email': {
      const to = val('e_to'); if (!to) return '';
      const q = [];
      if (val('e_subj')) q.push('subject='+encodeURIComponent(val('e_subj')));
      if (val('e_body')) q.push('body='+encodeURIComponent(val('e_body')));
      return 'mailto:'+to+(q.length?'?'+q.join('&'):'');
    }
    case 'tel': { const n = val('p_num'); return n?'tel:'+n.replace(/[^\d+*#]/g,''):''; }
  }
  return '';
}

const SWATCHES = ['#000000','#12151c','#2a2d36','#4b5060','#7c8395','#b8bec9','#ffffff',
  '#5b7da8','#6b7688','#8b9ab5','#6fbe8e','#a3b57c','#d4a45a','#d47272',
  '#b06878','#8a68a8','#5f7d9e','#3f4a5c','#1e2228','#2e3b4f'];
function renderColorPickers(){
  $$('.cp').forEach(cp=>{
    const key = cp.dataset.for;
    const cur = D[key] || '#000000';
    cp.innerHTML = `
      <div class="cp__swatches">${SWATCHES.map(s=>`<button class="cp__sw${s.toLowerCase()===cur.toLowerCase()?' is-active':''}" data-c="${s}" style="background:${s}"></button>`).join('')}</div>
      <div class="cp__custom">
        <input type="color" value="${cur}">
        <input class="cp__hex" type="text" value="${cur.toUpperCase()}" spellcheck="false" maxlength="7">
      </div>`;
    cp.addEventListener('click',e=>{
      const sw = e.target.closest('.cp__sw'); if (!sw) return;
      const c = sw.dataset.c;
      D[key] = c;
      $$('.cp__sw',cp).forEach(b=>b.classList.toggle('is-active',b.dataset.c===c));
      cp.querySelector('input[type="color"]').value = c;
      cp.querySelector('.cp__hex').value = c.toUpperCase();
      renderImmediate();
    });
    cp.querySelector('input[type="color"]').addEventListener('input',e=>{
      D[key] = e.target.value;
      cp.querySelector('.cp__hex').value = e.target.value.toUpperCase();
      $$('.cp__sw',cp).forEach(b=>b.classList.toggle('is-active',b.dataset.c.toLowerCase()===e.target.value.toLowerCase()));
      renderImmediate();
    });
    cp.querySelector('.cp__hex').addEventListener('change',e=>{
      let v = e.target.value.trim();
      if (!v.startsWith('#')) v = '#'+v;
      if (!/^#[0-9a-f]{6}$/i.test(v)){ e.target.value = D[key].toUpperCase(); return; }
      D[key] = v;
      cp.querySelector('input[type="color"]').value = v;
      $$('.cp__sw',cp).forEach(b=>b.classList.toggle('is-active',b.dataset.c.toLowerCase()===v.toLowerCase()));
      renderImmediate();
    });
  });
}
function refreshColorPickers(){
  $$('.cp').forEach(cp=>{
    const key = cp.dataset.for;
    const v = D[key] || '#000000';
    const inp = cp.querySelector('input[type="color"]');
    const hex = cp.querySelector('.cp__hex');
    if (inp) inp.value = v;
    if (hex) hex.value = v.toUpperCase();
    $$('.cp__sw',cp).forEach(b=>b.classList.toggle('is-active',b.dataset.c.toLowerCase()===v.toLowerCase()));
  });
}

const segVal = sel=>{const b=$(sel+' button.is-active');return b?b.dataset.val:null;};
function readDesign(){
  D.gradient = $('#gradOn').checked;
  D.angle = +$('#angle').value;
  D.transparent = $('#transparent').checked;
  D.shape = segVal('#shapeSeg') || 'square';
  D.eyeShape = segVal('#eyeSeg') || 'square';
  D.eyeCustom = $('#eyeCustom').checked;
  D.ecc = $('#ecc').value;
  D.margin = +$('#margin').value;
  D.size = +segVal('#sizeSeg') || 1024;
  D.frame = $('#frameOn').checked;
  D.frameText = ($('#frameText').value||'SCAN ME').trim();
  D.logoScale = +$('#logoScale').value/100;
  D.logoRadius = +$('#logoRadius').value/100;
}
function applyDesign(){
  $('#gradOn').checked = D.gradient;
  $('#angle').value = D.angle;
  $('#transparent').checked = D.transparent;
  setSeg('#shapeSeg',D.shape);
  setSeg('#eyeSeg',D.eyeShape);
  $('#eyeCustom').checked = D.eyeCustom;
  $('#ecc').value = D.ecc;
  $('#margin').value = D.margin;
  setSeg('#sizeSeg',String(D.size));
  $('#frameOn').checked = D.frame;
  $('#frameText').value = D.frameText;
  $('#logoScale').value = Math.round(D.logoScale*100);
  $('#logoRadius').value = Math.round(D.logoRadius*100);
  refreshColorPickers();
  syncUI();
}
function setSeg(sel,v){ $$(sel+' button').forEach(b=>b.classList.toggle('is-active',b.dataset.val===v)); }
function syncUI(){
  $('#angleVal').textContent = D.angle+'°';
  $('#marginVal').textContent = D.margin;
  $('#logoScaleVal').textContent = Math.round(D.logoScale*100)+'%';
  $('#logoRadiusVal').textContent = Math.round(D.logoRadius*100)+'%';
  $('#gradBox').hidden = !$('#gradOn').checked;
  $('#eyeColorBox').hidden = !$('#eyeCustom').checked;
  $('#frameBox').hidden = !$('#frameOn').checked;
  $('#w_passField').hidden = (val('w_enc')==='nopass');
  $('#logoRemove').hidden = !logoImg;
}

const isEye = (r,c,size)=>(r<7&&c<7)||(r<7&&c>=size-7)||(r>=size-7&&c<7);
const dark = (qr,r,c,size)=>{ if (r<0||c<0||r>=size||c>=size) return false; return qr.isDark(r,c); };

function drawRoundedCell(ctx,x,y,cell,rTL,rTR,rBR,rBL){
  ctx.beginPath();
  ctx.moveTo(x+rTL,y);
  ctx.lineTo(x+cell-rTR,y);
  if (rTR) ctx.arcTo(x+cell,y,x+cell,y+rTR,rTR);
  ctx.lineTo(x+cell,y+cell-rBR);
  if (rBR) ctx.arcTo(x+cell,y+cell,x+cell-rBR,y+cell,rBR);
  ctx.lineTo(x+rBL,y+cell);
  if (rBL) ctx.arcTo(x,y+cell,x,y+cell-rBL,rBL);
  ctx.lineTo(x,y+rTL);
  if (rTL) ctx.arcTo(x,y,x+rTL,y,rTL);
  ctx.closePath(); ctx.fill();
}
function drawModule(ctx,x,y,cell,qr,r,c,size){
  const cx = x+cell/2, cy = y+cell/2, R = cell/2;
  switch(D.shape){
    case 'rounded': {
      const rad = cell*0.5;
      const top = dark(qr,r-1,c,size), right = dark(qr,r,c+1,size),
            bot = dark(qr,r+1,c,size), left = dark(qr,r,c-1,size);
      drawRoundedCell(ctx,x,y,cell,
        (!top&&!left)?rad:0, (!top&&!right)?rad:0,
        (!bot&&!right)?rad:0, (!bot&&!left)?rad:0);
      break;
    }
    case 'dots': ctx.beginPath(); ctx.arc(cx,cy,R*0.94,0,Math.PI*2); ctx.fill(); break;
    case 'diamond': ctx.beginPath(); ctx.moveTo(cx,y); ctx.lineTo(x+cell,cy); ctx.lineTo(cx,y+cell); ctx.lineTo(x,cy); ctx.closePath(); ctx.fill(); break;
    case 'plus': { const t = cell*0.32; ctx.fillRect(cx-t/2,y,t,cell); ctx.fillRect(x,cy-t/2,cell,t); break; }
    case 'star': {
      const pts = 8, outerR = R, innerR = R*0.42;
      ctx.beginPath();
      for (let i=0;i<pts*2;i++){
        const ang = -Math.PI/2 + i*Math.PI/pts;
        const rr = i%2===0?outerR:innerR;
        const px = cx+Math.cos(ang)*rr, py = cy+Math.sin(ang)*rr;
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill(); break;
    }
    case 'hex': {
      const k = R*0.95;
      ctx.beginPath();
      for (let i=0;i<6;i++){
        const ang = -Math.PI/2 + i*Math.PI/3;
        const px = cx+Math.cos(ang)*k, py = cy+Math.sin(ang)*k;
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill(); break;
    }
    case 'bar-h': roundRect(ctx,x+cell*0.05,y+cell*0.30,cell*0.9,cell*0.4,cell*0.2); ctx.fill(); break;
    case 'bar-v': roundRect(ctx,x+cell*0.30,y+cell*0.05,cell*0.4,cell*0.9,cell*0.2); ctx.fill(); break;
    default: ctx.fillRect(x,y,cell,cell);
  }
}
function drawEye(ctx,x,y,cell,fill,shape){
  const s = 7*cell, inset = cell/2;
  ctx.lineWidth = cell; ctx.lineJoin = 'round';
  ctx.strokeStyle = fill; ctx.fillStyle = fill;
  if (shape==='circle'){
    const rOuter = (s-cell)/2, rInner = 1.5*cell;
    ctx.beginPath(); ctx.arc(x+s/2,y+s/2,rOuter,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+s/2,y+s/2,rInner,0,Math.PI*2); ctx.fill();
  } else if (shape==='rounded'){
    roundRect(ctx,x+inset,y+inset,s-cell,s-cell,cell*1.7); ctx.stroke();
    roundRect(ctx,x+2*cell,y+2*cell,3*cell,3*cell,cell*0.85); ctx.fill();
  } else if (shape==='leaf'){
    const r = (s-cell)/2;
    ctx.beginPath();
    ctx.moveTo(x+inset+r,y+inset);
    ctx.arcTo(x+inset+s-cell,y+inset,x+inset+s-cell,y+inset+s-cell,r);
    ctx.arcTo(x+inset+s-cell,y+inset+s-cell,x+inset,y+inset+s-cell,r);
    ctx.arcTo(x+inset,y+inset+s-cell,x+inset,y+inset,r);
    ctx.arcTo(x+inset,y+inset,x+inset+s-cell,y+inset,r);
    ctx.closePath(); ctx.stroke();
    roundRect(ctx,x+2*cell,y+2*cell,3*cell,3*cell,cell*0.85); ctx.fill();
  } else if (shape==='dots'){
    const dotR = cell*0.35;
    for (let i=0;i<7;i++){
      for (let j=0;j<7;j++){
        if (i>=1&&i<=5&&j>=1&&j<=5) continue;
        const px = x+cell/2+j*cell, py = y+cell/2+i*cell;
        ctx.beginPath(); ctx.arc(px,py,dotR,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.arc(x+s/2,y+s/2,1.6*cell,0,Math.PI*2); ctx.fill();
  } else {
    roundRect(ctx,x+inset,y+inset,s-cell,s-cell,0); ctx.stroke();
    roundRect(ctx,x+2*cell,y+2*cell,3*cell,3*cell,0); ctx.fill();
  }
}
function makeGradient(ctx,size,c1,c2,angleDeg){
  const a = (angleDeg-90)*Math.PI/180;
  const cx = size/2, cy = size/2, L = size/2;
  const g = ctx.createLinearGradient(cx-Math.cos(a)*L,cy-Math.sin(a)*L,cx+Math.cos(a)*L,cy+Math.sin(a)*L);
  g.addColorStop(0,c1); g.addColorStop(1,c2);
  return g;
}
function drawLogo(ctx, real){
  if (!logoImg) return;
  const size = current.size;
  const margin = D.margin;
  const cell = real / (size + margin*2);
  const qrStart = margin * cell;
  const qrInner = size * cell;
  const cardSide = qrInner * LOGO_CARD_RATIO;
  const x = qrStart + (qrInner - cardSide) / 2;
  const y = qrStart + (qrInner - cardSide) / 2;
  ctx.fillStyle = D.transparent ? '#ffffff' : D.bg;
  roundRect(ctx, x, y, cardSide, cardSide, cardSide * D.logoRadius);
  ctx.fill();
  const innerSize = cardSide * D.logoScale;
  const k = Math.min(innerSize / logoImg.width, innerSize / logoImg.height);
  const w = logoImg.width * k, h = logoImg.height * k;
  ctx.drawImage(logoImg, x + (cardSide - w)/2, y + (cardSide - h)/2, w, h);
}
function paintQR(revealFn){
  const size = current.size;
  const margin = D.margin;
  const total = size+margin*2;
  const cell = Math.max(2,Math.floor(D.size/total));
  const real = cell*total;
  const c = document.createElement('canvas');
  c.width = real; c.height = real;
  const ctx = c.getContext('2d');
  if (!D.transparent){ ctx.fillStyle = D.bg; ctx.fillRect(0,0,real,real); }
  const ox = margin*cell, oy = margin*cell;
  const fill = D.gradient ? makeGradient(ctx,real,D.fg,D.fg2,D.angle) : D.fg;
  ctx.fillStyle = fill;
  const qr = current.qr;
  for (let r=0;r<size;r++){
    for (let cc=0;cc<size;cc++){
      if (!qr.isDark(r,cc) || isEye(r,cc,size) || isLogoZone(r,cc,size)) continue;
      if (revealFn && !revealFn(r,cc)) continue;
      drawModule(ctx,ox+cc*cell,oy+r*cell,cell,qr,r,cc,size);
    }
  }
  const eyeFill = D.eyeCustom ? D.eyeColor : fill;
  drawEye(ctx,ox,oy,cell,eyeFill,D.eyeShape);
  drawEye(ctx,ox+(size-7)*cell,oy,cell,eyeFill,D.eyeShape);
  drawEye(ctx,ox,oy+(size-7)*cell,cell,eyeFill,D.eyeShape);
  if (logoImg) drawLogo(ctx, real);
  return c;
}
function paintFrame(qrCanvas){
  const qrW = qrCanvas.width;
  const pad = Math.round(qrW*0.045);
  const band = Math.round(qrW*0.16);
  const W = qrW+pad*2, H = qrW+pad*2+band;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = D.frameColor;
  roundRect(ctx,0,0,W,H,W*0.06); ctx.fill();
  ctx.fillStyle = D.transparent ? '#ffffff' : D.bg;
  roundRect(ctx,pad,pad,qrW,qrW,W*0.03); ctx.fill();
  ctx.drawImage(qrCanvas,pad,pad);
  ctx.fillStyle = D.frameTextColor;
  ctx.font = `800 ${Math.round(band*0.44)}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(D.frameText.toUpperCase(),W/2,pad+qrW+band/2+1);
  return c;
}
function commitCanvas(finalCanvas){
  current.canvas = finalCanvas;
  const cv = $('#qrCanvas');
  cv.width = finalCanvas.width; cv.height = finalCanvas.height;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.drawImage(finalCanvas,0,0);
}

function enableActions(on){ ['#dlPng','#dlSvg','#dlCopy'].forEach(s=>{$(s).disabled=!on;}); }
function showEmpty(){
  current.qr = null; current.canvas = null; current.text = '';
  $('#qrCanvas').style.display = 'none';
  $('#qrEmpty').style.display = 'flex';
  $('#previewMeta').textContent = '';
  $('#meterFill').style.width = '0%';
  $('#meterLabel').textContent = 'Ожидание';
  $('#meter').dataset.state = 'ok';
  $('#floatWin').classList.remove('has-code');
  enableActions(false);
}
function updateMeter(){
  const bgc = D.transparent ? '#ffffff' : D.bg;
  const fgAvg = D.gradient ? mixHex(D.fg,D.fg2) : D.fg;
  const ratio = contrast(fgAvg,bgc);
  let pct,label,st;
  if (ratio>=7){ pct=100; label='Отлично читается'; st='ok'; }
  else if (ratio>=4.5){ pct=78; label='Хорошо читается'; st='ok'; }
  else if (ratio>=3){ pct=50; label='Низкий контраст'; st='warn'; }
  else { pct=20; label='Плохо сканируется'; st='danger'; }
  if (logoImg && D.ecc!=='H'){ label='Логотип, ECC '+D.ecc; st='warn'; pct=Math.min(pct,55); }
  $('#meterFill').style.width = pct+'%';
  $('#meterLabel').textContent = label;
  $('#meter').dataset.state = st;
}
function renderImmediate(){
  readDesign();
  syncUI();
  const text = buildContent();
  current.text = text;
  if (!text){ showEmpty(); return; }
  if (typeof window.qrcode !== 'function'){ toast('QR библиотека не загрузилась'); return; }
  let qr;
  try { qr = window.qrcode(0,D.ecc); qr.addData(text); qr.make(); }
  catch(e){ showEmpty(); $('#qrEmpty').querySelector('p').textContent = 'Данных слишком много'; return; }
  current.qr = qr;
  current.size = qr.getModuleCount();
  const qc = paintQR();
  const fc = D.frame ? paintFrame(qc) : qc;
  commitCanvas(fc);
  $('#qrCanvas').style.display = 'block';
  $('#qrEmpty').style.display = 'none';
  $('#floatWin').classList.add('has-code');
  $('#previewMeta').textContent = `${current.size}×${current.size}`;
  updateMeter();
  enableActions(true);
  scheduleAutoSave();
}
function renderAnimated(){
  readDesign();
  syncUI();
  const text = buildContent();
  current.text = text;
  if (!text){ showEmpty(); return; }
  let qr;
  try { qr = window.qrcode(0,D.ecc); qr.addData(text); qr.make(); }
  catch(e){ showEmpty(); return; }
  current.qr = qr;
  current.size = qr.getModuleCount();
  $('#qrCanvas').style.display = 'block';
  $('#qrEmpty').style.display = 'none';
  $('#floatWin').classList.add('has-code');
  $('#previewMeta').textContent = `${current.size}×${current.size}`;
  updateMeter();
  enableActions(true);

  const size = current.size;
  const modules = [];
  const cx = size/2, cy = size/2;
  for (let r=0;r<size;r++){
    for (let cc=0;cc<size;cc++){
      if (!qr.isDark(r,cc) || isEye(r,cc,size) || isLogoZone(r,cc,size)) continue;
      modules.push({d:Math.hypot(r-cy,cc-cx)});
    }
  }
  const maxD = modules.length ? modules[modules.length-1].d : 1;
  const start = performance.now();
  const duration = 620;
  if (buildAnim) cancelAnimationFrame(buildAnim);

  function frame(now){
    const t = Math.min(1, (now-start)/duration);
    const ease = 1 - Math.pow(1-t, 3);
    const reveal = ease * (maxD + 2);
    const partial = paintQR((r,c)=>Math.hypot(r-cy,c-cx) <= reveal);
    const fc = D.frame ? paintFrame(partial) : partial;
    commitCanvas(fc);
    if (t < 1) buildAnim = requestAnimationFrame(frame);
    else buildAnim = null;
  }
  buildAnim = requestAnimationFrame(frame);
  scheduleAutoSave();
}
const doRender = deb(()=>{
  const text = buildContent();
  if (text && text !== lastTextKey){
    lastTextKey = text;
    renderAnimated();
  } else {
    renderImmediate();
  }
}, 100);

function buildSVG(){
  const size = current.size, margin = D.margin, total = size+margin*2;
  const cell = 12, qrW = total*cell;
  const pad = D.frame ? Math.round(qrW*0.045) : 0;
  const band = D.frame ? Math.round(qrW*0.16) : 0;
  const W = qrW+pad*2, H = qrW+pad*2+band;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  let fillRef = D.fg;
  if (D.gradient){
    const a = (D.angle-90)*Math.PI/180;
    const cx = pad+qrW/2, cy = pad+qrW/2, L = qrW/2;
    const x1 = (cx-Math.cos(a)*L).toFixed(1), y1 = (cy-Math.sin(a)*L).toFixed(1);
    const x2 = (cx+Math.cos(a)*L).toFixed(1), y2 = (cy+Math.sin(a)*L).toFixed(1);
    out.push(`<defs><linearGradient id="qg" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${D.fg}"/><stop offset="1" stop-color="${D.fg2}"/></linearGradient></defs>`);
    fillRef = 'url(#qg)';
  }
  if (D.frame){
    out.push(`<rect width="${W}" height="${H}" rx="${(W*0.06).toFixed(1)}" fill="${D.frameColor}"/>`);
    out.push(`<rect x="${pad}" y="${pad}" width="${qrW}" height="${qrW}" rx="${(W*0.03).toFixed(1)}" fill="${D.transparent?'#fff':D.bg}"/>`);
  } else if (!D.transparent){
    out.push(`<rect width="${W}" height="${H}" fill="${D.bg}"/>`);
  }
  const ox = pad+margin*cell, oy = pad+margin*cell;
  const qr = current.qr;
  for (let r=0;r<size;r++){
    for (let cc=0;cc<size;cc++){
      if (!qr.isDark(r,cc) || isEye(r,cc,size) || isLogoZone(r,cc,size)) continue;
      const x = ox+cc*cell, y = oy+r*cell;
      const cx = x+cell/2, cy = y+cell/2;
      switch(D.shape){
        case 'rounded': {
          const rad = cell*0.5;
          const top = dark(qr,r-1,cc,size), right = dark(qr,r,cc+1,size),
                bot = dark(qr,r+1,cc,size), left = dark(qr,r,cc-1,size);
          const rTL = (!top&&!left)?rad:0, rTR = (!top&&!right)?rad:0,
                rBR = (!bot&&!right)?rad:0, rBL = (!bot&&!left)?rad:0;
          out.push(`<path d="M${x+rTL} ${y}L${x+cell-rTR} ${y}${rTR?`Q${x+cell} ${y} ${x+cell} ${y+rTR}`:''}L${x+cell} ${y+cell-rBR}${rBR?`Q${x+cell} ${y+cell} ${x+cell-rBR} ${y+cell}`:''}L${x+rBL} ${y+cell}${rBL?`Q${x} ${y+cell} ${x} ${y+cell-rBL}`:''}L${x} ${y+rTL}${rTL?`Q${x} ${y} ${x+rTL} ${y}`:''}Z" fill="${fillRef}"/>`);
          break;
        }
        case 'dots': out.push(`<circle cx="${cx}" cy="${cy}" r="${(cell*0.47).toFixed(1)}" fill="${fillRef}"/>`); break;
        case 'diamond': out.push(`<path d="M${cx} ${y}L${x+cell} ${cy}L${cx} ${y+cell}L${x} ${cy}Z" fill="${fillRef}"/>`); break;
        case 'plus': { const t = cell*0.32;
          out.push(`<rect x="${cx-t/2}" y="${y}" width="${t}" height="${cell}" fill="${fillRef}"/>`);
          out.push(`<rect x="${x}" y="${cy-t/2}" width="${cell}" height="${t}" fill="${fillRef}"/>`); break; }
        case 'hex': {
          const k = cell*0.475, pts = [];
          for (let i=0;i<6;i++){
            const ang = -Math.PI/2 + i*Math.PI/3;
            pts.push(`${(cx+Math.cos(ang)*k).toFixed(1)},${(cy+Math.sin(ang)*k).toFixed(1)}`);
          }
          out.push(`<polygon points="${pts.join(' ')}" fill="${fillRef}"/>`); break;
        }
        case 'bar-h': out.push(`<rect x="${x+cell*0.05}" y="${y+cell*0.30}" width="${cell*0.9}" height="${cell*0.4}" rx="${cell*0.2}" fill="${fillRef}"/>`); break;
        case 'bar-v': out.push(`<rect x="${x+cell*0.30}" y="${y+cell*0.05}" width="${cell*0.4}" height="${cell*0.9}" rx="${cell*0.2}" fill="${fillRef}"/>`); break;
        default: out.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fillRef}"/>`);
      }
    }
  }
  const eyeFill = D.eyeCustom ? D.eyeColor : fillRef;
  [[ox,oy],[ox+(size-7)*cell,oy],[ox,oy+(size-7)*cell]].forEach(([x,y])=>{
    const s = 7*cell, inset = cell/2;
    if (D.eyeShape==='circle'){
      out.push(`<circle cx="${x+s/2}" cy="${y+s/2}" r="${(s-cell)/2}" fill="none" stroke="${eyeFill}" stroke-width="${cell}"/>`);
      out.push(`<circle cx="${x+s/2}" cy="${y+s/2}" r="${1.5*cell}" fill="${eyeFill}"/>`);
    } else {
      const rad = D.eyeShape==='rounded'?cell*1.7:0;
      const rad2 = D.eyeShape==='rounded'?cell*0.85:0;
      out.push(`<rect x="${x+inset}" y="${y+inset}" width="${s-cell}" height="${s-cell}" rx="${rad}" fill="none" stroke="${eyeFill}" stroke-width="${cell}"/>`);
      out.push(`<rect x="${x+2*cell}" y="${y+2*cell}" width="${3*cell}" height="${3*cell}" rx="${rad2}" fill="${eyeFill}"/>`);
    }
  });
  if (logoImg && logoDataUrl){
    const qrStart = pad + margin*cell;
    const qrInner = size * cell;
    const cardSide = qrInner * LOGO_CARD_RATIO;
    const cx = qrStart + (qrInner - cardSide) / 2;
    const cy = qrStart + (qrInner - cardSide) / 2;
    out.push(`<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cardSide.toFixed(1)}" height="${cardSide.toFixed(1)}" rx="${(cardSide*D.logoRadius).toFixed(1)}" fill="${D.transparent ? '#ffffff' : D.bg}"/>`);
    const innerSize = cardSide * D.logoScale;
    const k = Math.min(innerSize / logoImg.width, innerSize / logoImg.height);
    const w = logoImg.width * k, h = logoImg.height * k;
    const ix = cx + (cardSide - w) / 2;
    const iy = cy + (cardSide - h) / 2;
    out.push(`<image href="${logoDataUrl}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  if (D.frame){
    out.push(`<text x="${W/2}" y="${pad+qrW+band/2}" fill="${D.frameTextColor}" font-family="Inter, system-ui, sans-serif" font-size="${(band*0.44).toFixed(1)}" font-weight="800" text-anchor="middle" dominant-baseline="central">${esc(D.frameText.toUpperCase())}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

$('#dlPng').addEventListener('click',()=>{
  if (!current.canvas) return;
  downloadURL(current.canvas.toDataURL('image/png'),'qr-code.png');
  toast('PNG сохранён');
});
$('#dlSvg').addEventListener('click',()=>{
  if (!current.qr) return;
  const svg = buildSVG();
  const blob = new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  downloadURL(url,'qr-code.svg');
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  toast('SVG сохранён');
});
$('#dlCopy').addEventListener('click',async()=>{
  if (!current.canvas) return;
  try {
    const blob = await new Promise(r=>current.canvas.toBlob(r,'image/png'));
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('unsupported');
    await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    toast('Изображение скопировано');
  } catch(e){ toast('Копирование не поддерживается'); }
});

const HIST_KEY = 'qrg:history:v8';
const loadHist = ()=>{ try{ return JSON.parse(localStorage.getItem(HIST_KEY))||[]; }catch(e){ return []; } };
const saveHist = l=>{ try{ localStorage.setItem(HIST_KEY,JSON.stringify(l.slice(0,30))); }catch(e){} };
function makeThumb(canvas){
  const s = 180;
  const t = document.createElement('canvas');
  t.width = s; t.height = s;
  const ctx = t.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,s,s);
  const k = Math.min(s/canvas.width,s/canvas.height);
  const w = canvas.width*k, h = canvas.height*k;
  ctx.drawImage(canvas,(s-w)/2,(s-h)/2,w,h);
  return t.toDataURL('image/jpeg',0.72);
}
function snapshotFields(){
  const o = {};
  $$('#typeForms input, #typeForms select, #typeForms textarea').forEach(el=>{
    if (el.id) o[el.id] = el.type==='checkbox'?el.checked:el.value;
  });
  return o;
}
let autosaveTimer = null, lastSavedContent = '';
function scheduleAutoSave(){
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=>{
    if (!current.canvas || !current.qr) return;
    if (!current.text || current.text === lastSavedContent) return;
    if (current.text.length < 2) return;
    lastSavedContent = current.text;
    const list = loadHist();
    const entry = {
      id: Date.now()+'-'+Math.random().toString(36).slice(2,7),
      type: state.type,
      typeLabel: TYPE_LABELS[state.type]||'QR',
      content: current.text,
      thumb: makeThumb(current.canvas),
      date: Date.now(),
      design: Object.assign({},D),
      fields: snapshotFields()
    };
    const filtered = list.filter(x=>x.content !== entry.content);
    filtered.unshift(entry);
    saveHist(filtered);
    renderHistory();
  }, 1500);
}
$('#histClear').addEventListener('click',()=>{
  if (!loadHist().length) return;
  if (!confirm('Удалить все сохранённые коды?')) return;
  localStorage.removeItem(HIST_KEY);
  lastSavedContent = '';
  renderHistory();
  toast('История очищена');
});
function renderHistory(){
  const list = loadHist();
  const badge = $('#histCount');
  badge.textContent = list.length;
  badge.dataset.empty = list.length?'0':'1';
  const grid = $('#histGrid');
  if (!list.length){
    grid.innerHTML = '<div class="empty">Здесь появятся сохранённые коды.<br>Введите данные — они сохранятся автоматически.</div>';
    return;
  }
  grid.innerHTML = list.map(it=>`
    <article class="hist-card" data-id="${it.id}">
      <div class="hist-thumb"><img src="${it.thumb}" alt=""></div>
      <div class="hist-body">
        <span class="hist-tag">${esc(it.typeLabel)}</span>
        <p class="hist-text">${esc(it.content)}</p>
        <time>${new Date(it.date).toLocaleString('ru-RU')}</time>
      </div>
      <div class="hist-actions">
        <button class="btn btn--sm" data-act="use">Открыть</button>
        <button class="btn btn--sm btn--danger" data-act="del">Удалить</button>
      </div>
    </article>
  `).join('');
}
$('#histGrid').addEventListener('click',e=>{
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('.hist-card').dataset.id;
  const list = loadHist();
  const item = list.find(x=>x.id===id);
  if (!item) return;
  if (btn.dataset.act==='del'){
    saveHist(list.filter(x=>x.id!==id));
    renderHistory(); toast('Удалено');
    return;
  }
  if (item.fields){
    Object.entries(item.fields).forEach(([k,v])=>{
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type==='checkbox') el.checked = v; else el.value = v;
    });
  }
  if (item.design){ Object.assign(D,item.design); applyDesign(); }
  setType(item.type||'text');
  switchView('gen');
  lastTextKey = '';
  doRender();
  toast('Восстановлено');
});

function setType(type){
  state.type = type;
  $$('#typeChips .chip').forEach(c=>c.classList.toggle('is-active',c.dataset.type===type));
  $$('#typeForms .tform').forEach(f=>{ f.hidden = (f.dataset.type!==type); });
}
$('#typeChips').addEventListener('click',e=>{
  const chip = e.target.closest('.chip'); if (!chip) return;
  setType(chip.dataset.type);
  lastTextKey = '';
  doRender();
});

$('#resetStyle').addEventListener('click',()=>{
  Object.assign(D,{
    fg:'#12151c', fg2:'#6b7688', bg:'#ffffff',
    gradient:false, angle:45, transparent:false,
    shape:'square', eyeShape:'square', eyeCustom:false, eyeColor:'#12151c',
    ecc:'M', margin:4, size:1024,
    frame:false, frameText:'SCAN ME', frameColor:'#12161f', frameTextColor:'#ffffff',
    logoScale:0.76, logoRadius:0.16
  });
  logoImg = null; logoDataUrl = null;
  $('#logoInput').value = '';
  applyDesign();
  updateLogoPreview();
  renderImmediate();
});

function updateLogoPreview(){
  const inner = $('#logoPreviewInner');
  const img = $('#logoPreviewImg');
  if (!logoImg){ img.hidden = true; return; }
  img.hidden = false;
  img.src = logoDataUrl || logoImg.src;
  const boxSize = 170;
  const cardSize = boxSize * 0.92;
  inner.style.width = cardSize+'px';
  inner.style.height = cardSize+'px';
  inner.style.borderRadius = (cardSize * D.logoRadius)+'px';
  const innerImgSize = cardSize * D.logoScale * 0.85;
  const k = Math.min(innerImgSize / logoImg.width, innerImgSize / logoImg.height);
  const w = logoImg.width * k, h = logoImg.height * k;
  img.style.width = w+'px';
  img.style.height = h+'px';
}
$('#logoInput').addEventListener('change',e=>{
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev)=>{
    logoDataUrl = ev.target.result;
    try {
      logoImg = await loadImage(logoDataUrl);
      if (D.ecc !== 'H'){ D.ecc = 'H'; $('#ecc').value='H'; toast('ECC повышен до H для логотипа'); }
      syncUI(); updateLogoPreview(); renderImmediate();
    } catch(err){ toast('Не удалось загрузить'); }
  };
  reader.readAsDataURL(file);
});
$('#logoRemove').addEventListener('click',()=>{
  logoImg = null; logoDataUrl = null; $('#logoInput').value = '';
  syncUI(); updateLogoPreview(); renderImmediate();
});
$('#logoScale').addEventListener('input',()=>{
  readDesign(); syncUI(); updateLogoPreview(); renderImmediate();
});
$('#logoRadius').addEventListener('input',()=>{
  readDesign(); syncUI(); updateLogoPreview(); renderImmediate();
});

$('#geoBtn').addEventListener('click',()=>{
  if (!navigator.geolocation){ toast('Геолокация недоступна'); return; }
  toast('Определяем координаты…');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      $('#g_lat').value = pos.coords.latitude.toFixed(6);
      $('#g_lng').value = pos.coords.longitude.toFixed(6);
      lastTextKey = '';
      doRender(); toast('Координаты получены');
    },
    ()=>toast('Не удалось получить координаты'),
    { enableHighAccuracy:true, timeout:10000 }
  );
});

$('section[data-view="gen"]').addEventListener('input',doRender);
$('section[data-view="gen"]').addEventListener('change',doRender);
$$('#shapeSeg button, #eyeSeg button, #sizeSeg button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $$('button',btn.parentElement).forEach(b=>b.classList.toggle('is-active',b===btn));
    readDesign();
    renderImmediate();
  });
});

const MOON = '<path d="M9 .5a.8.8 0 0 1 .1.9A10.8 10.8 0 0 0 7.8 6.6C7.8 12.6 12.7 17.5 18.7 17.5c.9 0 1.7-.1 2.5-.3a.8.8 0 0 1 .8.3.8.8 0 0 1 0 1A12.5 12.5 0 0 1 12.5 24 12.5 12.5 0 0 1 0 11.6 12.5 12.5 0 0 1 7.7.1a.8.8 0 0 1 .9.4z"/>';
const SUN = '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-1.5a1 1 0 0 1 1 1V8a1 1 0 0 1-2 0V6.5a1 1 0 0 1 1-1zm0 13a1 1 0 0 1 1 1v1.5a1 1 0 0 1-2 0V19.5a1 1 0 0 1 1-1zM4.5 12a1 1 0 0 1 1-1H7a1 1 0 0 1 0 2H5.5a1 1 0 0 1-1-1zm12.5 0a1 1 0 0 1 1-1h1.5a1 1 0 0 1 0 2H18a1 1 0 0 1-1-1zM6.7 6.7a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1-1.4 1.5l-1-1a1 1 0 0 1 0-1.5zm9.2 9.2a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1-1.4 1.4l-1-1a1 1 0 0 1 0-1.4zm1.4-9.2a1 1 0 0 1 0 1.4l-1 1a1 1 0 1 1-1.4-1.4l1-1a1 1 0 0 1 1.4 0zm-9.2 9.2a1 1 0 0 1 0 1.4l-1 1a1 1 0 1 1-1.4-1.4l1-1a1 1 0 0 1 1.4 0z"/>';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  $('#themeIcon').innerHTML = t==='paper'?SUN:MOON;
  try{ localStorage.setItem('qrg:theme',t); }catch(e){}
}
$('#themeBtn').addEventListener('click',()=>{
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur==='paper'?'graphite':'paper');
});

function switchView(name){
  const cur = $('.view.is-active');
  const target = $('.view[data-view="'+name+'"]');
  if (cur === target){ updateCrumbsPill(); return; }
  $$('.dock__btn[data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===name));
  $$('.view').forEach(v=>v.classList.toggle('is-active',v.dataset.view===name));
  if (name==='history') renderHistory();
  if (name!=='scan') stopCamera();
  if (isMobile()) $('#floatWin').classList.remove('is-open');
  window.scrollTo({top:0,behavior:'auto'});
}
$('#dock').addEventListener('click',e=>{
  const b = e.target.closest('.dock__btn[data-view]');
  if (b) switchView(b.dataset.view);
});

function updateCrumbsPill(){
  const pill = $('#crumbsPill');
  const active = $('.crumb.is-active');
  const container = $('#crumbs');
  if (!pill || !active || !container) return;
  const cr = container.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  pill.style.left = (ar.left - cr.left)+'px';
  pill.style.width = ar.width+'px';
}
function goStep(n){
  n = +n;
  $$('.crumb').forEach(c=>{
    const s = +c.dataset.step;
    c.classList.toggle('is-active', s===n);
    c.classList.toggle('is-done', s<n);
  });
  $$('.step-page').forEach(p=>p.classList.toggle('is-active', +p.dataset.step===n));
  updateCrumbsPill();
  window.scrollTo({top:0,behavior:'smooth'});
}
$('#crumbs').addEventListener('click',e=>{
  const b = e.target.closest('.crumb'); if (b) goStep(b.dataset.step);
});
$$('button[data-next]').forEach(b=>b.addEventListener('click',()=>goStep(b.dataset.next)));
$$('button[data-prev]').forEach(b=>b.addEventListener('click',()=>goStep(b.dataset.prev)));
window.addEventListener('resize',updateCrumbsPill);

const isMobile = ()=> window.matchMedia('(max-width: 720px)').matches;

(function(){
  const win = $('#floatWin');
  const head = $('#floatHead');
  const KEY = 'qrg:float:v5';
  let drag = null;

  function placeDefault(){
    const w = win.offsetWidth || 320;
    const x = Math.max(12, window.innerWidth - w - 24);
    win.style.left = x+'px';
    win.style.top = '90px';
  }
  function clampPos(){
    const r = win.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - r.width - 8, r.left));
    const y = Math.max(8, Math.min(window.innerHeight - r.height - 8, r.top));
    win.style.left = x+'px';
    win.style.top = y+'px';
  }
  function savePos(){
    if (isMobile()) return;
    try{ localStorage.setItem(KEY,JSON.stringify({x:win.style.left,y:win.style.top})); }catch(e){}
  }
  function restorePos(){
    if (isMobile()) return;
    try {
      const p = JSON.parse(localStorage.getItem(KEY));
      if (p && p.x && p.y){
        win.style.left = p.x; win.style.top = p.y;
        clampPos();
        return;
      }
    } catch(e){}
    placeDefault();
  }

  head.addEventListener('pointerdown',e=>{
    if (e.target.closest('button')) return;
    if (isMobile()) return;
    const r = win.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    win.classList.add('is-dragging');
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove',e=>{
    if (!drag) return;
    const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
    let nx = drag.left+dx, ny = drag.top+dy;
    const r = win.getBoundingClientRect();
    nx = Math.max(8, Math.min(window.innerWidth-r.width-8, nx));
    ny = Math.max(8, Math.min(window.innerHeight-r.height-8, ny));
    win.style.left = nx+'px';
    win.style.top = ny+'px';
  });
  head.addEventListener('pointerup',()=>{
    if (!drag) return;
    drag = null;
    win.classList.remove('is-dragging');
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = win.getBoundingClientRect();
    const distL = r.left, distR = vw - r.right, distT = r.top, distB = vh - r.bottom;
    const SNAP = 70, EDGE = 10;
    let targetL = r.left, targetT = r.top, snapped = false;
    if (distL < SNAP && distL <= distR && distL <= distT && distL <= distB){ targetL = EDGE; snapped = true; }
    else if (distR < SNAP && distR <= distT && distR <= distB){ targetL = vw - r.width - EDGE; snapped = true; }
    else if (distT < SNAP && distT <= distB){ targetT = EDGE; snapped = true; }
    else if (distB < SNAP){ targetT = vh - r.height - EDGE; snapped = true; }
    if (snapped){
      win.classList.add('is-snapping');
      win.style.left = targetL + 'px';
      win.style.top = targetT + 'px';
      setTimeout(()=>win.classList.remove('is-snapping'), 400);
    }
    savePos();
  });
  head.addEventListener('pointercancel',()=>{
    drag = null;
    win.classList.remove('is-dragging');
  });
  head.addEventListener('click',e=>{
    if (e.target.closest('button')) return;
    if (!isMobile()) return;
    win.classList.toggle('is-open');
  });
  window.addEventListener('resize',()=>{
    if (!isMobile()) clampPos();
    else win.classList.remove('is-open');
  });
  $('#floatReset').addEventListener('click',(e)=>{
    e.stopPropagation();
    placeDefault(); savePos();
  });
  restorePos();
})();

const video = $('#camVideo');
const scanC = document.createElement('canvas');
const scanCtx = scanC.getContext('2d',{willReadFrequently:true});
let camStream = null, camRAF = null, camFacing = 'environment', camTorchOn = false, lastScanTime = 0;

function beep(){
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    beep.ctx = beep.ctx || new Ctx();
    const ctx = beep.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.18);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime+0.2);
  } catch(e){}
}
async function startCamera(){
  if (typeof window.jsQR !== 'function'){ toast('Сканер не загрузился'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast('Камера недоступна'); return;
  }
  stopCamera();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch(err){ toast('Нет доступа к камере'); return; }
  video.srcObject = camStream;
  try { await video.play(); } catch(e){}
  $('#cam').classList.add('is-on');
  $('#cam').hidden = false;
  $('#scanUpload').hidden = true;
  $('#camActions').hidden = false;
  const track = camStream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  $('#camTorch').hidden = !caps.torch;
  camTorchOn = false;
  $('#camTorch').style.color = '';
  camRAF = requestAnimationFrame(cameraTick);
}
function stopCamera(){
  if (camRAF){ cancelAnimationFrame(camRAF); camRAF = null; }
  if (camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream = null; }
  video.srcObject = null;
  $('#cam').classList.remove('is-on');
  $('#cam').hidden = true;
  $('#scanUpload').hidden = false;
  $('#camActions').hidden = true;
  $('#camTorch').hidden = true;
}
function cameraTick(){
  camRAF = requestAnimationFrame(cameraTick);
  if (!video.videoWidth) return;
  const now = performance.now();
  if (now-lastScanTime < 90) return;
  lastScanTime = now;
  const maxW = 720;
  const k = Math.min(1, maxW/video.videoWidth);
  const w = Math.round(video.videoWidth*k), h = Math.round(video.videoHeight*k);
  scanC.width = w; scanC.height = h;
  scanCtx.drawImage(video,0,0,w,h);
  let imgData;
  try { imgData = scanCtx.getImageData(0,0,w,h); } catch(e){ return; }
  const code = window.jsQR(imgData.data,w,h,{inversionAttempts:'attemptBoth'});
  if (code && code.data){
    beep(); if (navigator.vibrate) navigator.vibrate(60);
    showScanResult(code.data); stopCamera();
    toast('QR распознан');
  }
}
$('#camStart').addEventListener('click',startCamera);
$('#camStop').addEventListener('click',stopCamera);
$('#camSwitch').addEventListener('click',()=>{ camFacing = camFacing==='environment'?'user':'environment'; startCamera(); });
$('#camTorch').addEventListener('click',async()=>{
  if (!camStream) return;
  const track = camStream.getVideoTracks()[0];
  if (!track || !track.applyConstraints) return;
  camTorchOn = !camTorchOn;
  try { await track.applyConstraints({advanced:[{torch:camTorchOn}]});
    $('#camTorch').style.color = camTorchOn ? 'var(--text)' : ''; }
  catch(e){ toast('Подсветка недоступна'); }
});

function decodeFromCanvas(canvas){
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  const w = canvas.width, h = canvas.height;
  let d = ctx.getImageData(0,0,w,h);
  let code = window.jsQR(d.data,w,h,{inversionAttempts:'attemptBoth'});
  if (code) return code;
  const base = d.data;
  for (const th of [110,140,170,200]){
    const copy = new Uint8ClampedArray(base);
    for (let i=0;i<copy.length;i+=4){
      const g = 0.299*copy[i] + 0.587*copy[i+1] + 0.114*copy[i+2];
      const v = g<th?0:255;
      copy[i]=copy[i+1]=copy[i+2]=v;
    }
    code = window.jsQR(copy,w,h,{inversionAttempts:'attemptBoth'});
    if (code) return code;
  }
  const inv = new Uint8ClampedArray(base);
  for (let i=0;i<inv.length;i+=4){ inv[i]=255-inv[i]; inv[i+1]=255-inv[i+1]; inv[i+2]=255-inv[i+2]; }
  return window.jsQR(inv,w,h,{inversionAttempts:'attemptBoth'});
}
async function scanImageFile(file){
  if (typeof window.jsQR !== 'function'){ toast('Сканер не загрузился'); return; }
  if (!file.type.startsWith('image/')){ toast('Это не изображение'); return; }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const attempts = [];
    const maxSide1 = 1400;
    const k1 = Math.min(1, maxSide1/Math.max(img.naturalWidth,img.naturalHeight));
    attempts.push({w:Math.round(img.naturalWidth*k1),h:Math.round(img.naturalHeight*k1),smooth:true});
    if (Math.max(img.naturalWidth,img.naturalHeight) < 900){
      attempts.push({w:Math.round(img.naturalWidth*2),h:Math.round(img.naturalHeight*2),smooth:true});
    }
    attempts.push({w:Math.round(img.naturalWidth*1.5),h:Math.round(img.naturalHeight*1.5),smooth:false});

    let code = null;
    for (const a of attempts){
      const c = document.createElement('canvas');
      c.width = a.w; c.height = a.h;
      const ctx = c.getContext('2d',{willReadFrequently:true});
      ctx.imageSmoothingEnabled = a.smooth;
      if (a.smooth) ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,a.w,a.h);
      ctx.drawImage(img,0,0,a.w,a.h);
      code = decodeFromCanvas(c);
      if (code) break;
    }
    if (code && code.data){
      beep();
      showScanResult(code.data);
      toast('QR распознан');
    } else {
      showScanResult(null);
      toast('Код не найден');
    }
  } catch(e){ console.error(e); toast('Не удалось прочитать файл'); }
  finally { URL.revokeObjectURL(url); }
}

$('#dropzone').addEventListener('click',()=>$('#fileInput').click());
$('#fileInput').addEventListener('change',e=>{
  const f = e.target.files && e.target.files[0]; if (f) scanImageFile(f);
  e.target.value = '';
});
['dragenter','dragover'].forEach(ev=>{
  $('#dropzone').addEventListener(ev,e=>{ e.preventDefault(); $('#dropzone').classList.add('is-over'); });
});
['dragleave','drop'].forEach(ev=>{
  $('#dropzone').addEventListener(ev,e=>{ e.preventDefault(); $('#dropzone').classList.remove('is-over'); });
});
$('#dropzone').addEventListener('drop',e=>{
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) scanImageFile(f);
});
document.addEventListener('paste',e=>{
  if (!$('.view[data-view="scan"]').classList.contains('is-active')) return;
  const items = e.clipboardData && e.clipboardData.items; if (!items) return;
  for (const it of items){
    if (it.type.startsWith('image/')){
      const f = it.getAsFile();
      if (f){ scanImageFile(f); toast('Изображение из буфера'); }
      break;
    }
  }
});

function parseGeo(s){
  const m = s.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  return m ? {lat: parseFloat(m[1]), lng: parseFloat(m[2])} : null;
}
function parseWifi(s){
  const out = {};
  const re = /([A-Z]+):((?:\\.|[^;\\])*)/g;
  let m;
  while ((m = re.exec(s)) !== null){
    out[m[1].toUpperCase()] = m[2].replace(/\\(.)/g, '$1');
  }
  return out;
}
function parseMailto(s){
  const body = s.replace(/^mailto:/i,'');
  const [addr, query] = body.split('?');
  const params = {};
  if (query){
    query.split('&').forEach(p=>{
      const [k,v] = p.split('=');
      if (k) params[k.toLowerCase()] = decodeURIComponent(v||'');
    });
  }
  return { to: addr, subject: params.subject, body: params.body };
}
function getDomain(url){
  try { return new URL(url).hostname; } catch(e){
    try { return new URL('https://'+url).hostname; } catch(e2){ return url; }
  }
}
const ICONS = {
  url: '<path d="M4.7 6.5L3.3 7.9a3 3 0 1 0 4.3 4.3l1.8-1.8a3 3 0 0 0-1-4.9L8 6a1 1 0 0 0-.15.2 2 2 0 0 1 .86 3.34L6.88 11.45a2 2 0 1 1-2.83-2.83l.79-.79a4 4 0 0 1-.13-1.29z"/><path d="M6.6 4.7A3 3 0 0 0 7.4 9.5l.78-.78a2 2 0 0 1-.9-3.35L9.1 3.55a2 2 0 1 1 2.83 2.83l-.79.79c.11.42.15.85.13 1.29l1.37-1.37a3 3 0 1 0-4.24-4.24z"/>',
  text: '<path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm2 1v14h14V5zm2 2h10v2H7zm0 4h10v2H7zm0 4h6v2H7z"/>',
  wifi: '<path d="M12 20a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4-3a6 6 0 0 1 8 0l-1.5 1.5a4 4 0 0 0-5 0zM4 13a11 11 0 0 1 16 0l-1.5 1.5a9 9 0 0 0-13 0zM0 9a15 15 0 0 1 24 0l-1.5 1.5a13 13 0 0 0-21 0z"/>',
  geo: '<path d="M12 2a8 8 0 0 0-8 8c0 5.3 8 12 8 12s8-6.7 8-12a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>',
  email: '<path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm2.4.6L12 11l7.6-6.4H4.4zm-.4 1.5V19h16V6.1l-8 6.8-8-6.8z"/>',
  tel: '<path d="M6 3a2 2 0 0 1 1.7 1l1.3 2.3a2 2 0 0 1-.3 2.4l-.9.9a12 12 0 0 0 5.6 5.6l.9-.9a2 2 0 0 1 2.4-.3l2.3 1.3A2 2 0 0 1 20 17v1a3 3 0 0 1-3 3A15 15 0 0 1 3 7a3 3 0 0 1 3-3z"/>'
};
function detectType(s){
  const geo = parseGeo(s);
  if (geo) return { type:'geo', ...geo };
  if (/^https?:\/\//i.test(s)) return { type:'url', url:s, domain:getDomain(s) };
  if (/^WIFI:/i.test(s)) return { type:'wifi', data: parseWifi(s) };
  if (/^mailto:/i.test(s)) return { type:'email', data: parseMailto(s) };
  if (/^tel:/i.test(s)) return { type:'tel', number:s.replace(/^tel:/i,'') };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { type:'email', data:{ to:s } };
  return { type:'text', text:s };
}

function showScanResult(data){
  const box = $('#scanResult');
  if (!data){
    box.innerHTML = `<div class="result-empty"><h3>Код не распознан</h3><p>Попробуйте другое фото или добавьте контраста.</p></div>`;
    return;
  }
  const info = detectType(data);
  let html = '';

  if (info.type === 'geo'){
    const {lat,lng} = info;
    html = `
      <div class="result-card">
        <div class="result-card__head">
          <div class="result-card__icon"><svg viewBox="0 0 24 24">${ICONS.geo}</svg></div>
          <div style="min-width:0">
            <div class="result-card__title">Геолокация</div>
            <div class="result-card__subtitle">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
          </div>
        </div>
        <div class="result-card__body">
          <div class="map-wrap">
            <iframe src="https://yandex.ru/map-widget/v1/?ll=${lng}%2C${lat}&z=15&pt=${lng},${lat},pm2rdm" loading="lazy" allowfullscreen></iframe>
          </div>
        </div>
        <div class="result-card__actions">
          <a class="btn btn--primary" href="https://yandex.ru/maps/?pt=${lng},${lat}&z=17&l=map" target="_blank" rel="noopener">Яндекс.Карты</a>
          <button class="btn" data-copy="${esc(data)}">Копировать</button>
        </div>
      </div>`;
  } else if (info.type === 'url'){
    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(info.domain)}&sz=64`;
    html = `
      <div class="result-card">
        <div class="result-card__head">
          <div class="favicon-wrap"><img src="${favicon}" alt="" onerror="this.style.display='none'"></div>
          <div style="min-width:0;flex:1">
            <div class="result-card__title">Ссылка</div>
            <div class="result-card__subtitle">${esc(info.domain)}</div>
          </div>
        </div>
        <div class="result-card__body">
          <div class="result-text">${esc(data)}</div>
        </div>
        <div class="result-card__actions">
          <a class="btn btn--primary" href="${esc(info.url)}" target="_blank" rel="noopener">Перейти</a>
          <button class="btn" data-copy="${esc(data)}">Копировать</button>
          <button class="btn btn--ghost" data-to-qr="${esc(data)}">QR</button>
        </div>
      </div>`;
  } else if (info.type === 'wifi'){
    const d = info.data;
    const ssid = d.S || '';
    const pass = d.P || '';
    const enc = (d.T || 'WPA').toUpperCase();
    html = `
      <div class="result-card">
        <div class="result-card__head">
          <div class="result-card__icon"><svg viewBox="0 0 24 24">${ICONS.wifi}</svg></div>
          <div style="min-width:0">
            <div class="result-card__title">Wi-Fi сеть</div>
            <div class="result-card__subtitle">${esc(ssid)}</div>
          </div>
        </div>
        <div class="result-card__body">
          <div class="field-row"><span>Сеть</span><span>${esc(ssid)}</span></div>
          <div class="field-row"><span>Шифрование</span><span>${esc(enc === 'NOPASS' ? 'Открытая' : enc)}</span></div>
          ${pass ? `<div class="field-row"><span>Пароль</span><span>${esc(pass)}</span></div>` : ''}
        </div>
        <div class="result-card__actions">
          ${pass ? `<button class="btn btn--primary" data-copy="${esc(pass)}">Пароль</button>` : ''}
          <button class="btn" data-copy="${esc(data)}">Скопировать строку</button>
        </div>
      </div>`;
  } else if (info.type === 'email'){
    const d = info.data;
    html = `
      <div class="result-card">
        <div class="result-card__head">
          <div class="result-card__icon"><svg viewBox="0 0 24 24">${ICONS.email}</svg></div>
          <div style="min-width:0">
            <div class="result-card__title">E-mail</div>
            <div class="result-card__subtitle">${esc(d.to||'')}</div>
          </div>
        </div>
        <div class="result-card__body">
          ${d.subject ? `<div class="field-row"><span>Тема</span><span>${esc(d.subject)}</span></div>` : ''}
          ${d.body ? `<div style="margin-top:10px"><div class="result-text">${esc(d.body)}</div></div>` : ''}
        </div>
        <div class="result-card__actions">
          <a class="btn btn--primary" href="${esc(data)}">Написать</a>
          <button class="btn" data-copy="${esc(d.to||'')}">Копировать адрес</button>
        </div>
      </div>`;
  } else if (info.type === 'tel'){
    const n = info.number;
    html = `
      <div class="result-card">
        <div class="result-card__head">
          <div class="result-card__icon"><svg viewBox="0 0 24 24">${ICONS.tel}</svg></div>
          <div style="min-width:0">
            <div class="result-card__title">Телефон</div>
            <div class="result-card__subtitle">${esc(n)}</div>
          </div>
        </div>
        <div class="result-card__actions">
          <a class="btn btn--primary" href="tel:${esc(n)}">Позвонить</a>
          <button class="btn" data-copy="${esc(n)}">Копировать</button>
        </div>
      </div>`;
  } else {
    html = `
      <div class="result-card">
        <div class="result-card__head">
          <div class="result-card__icon"><svg viewBox="0 0 24 24">${ICONS.text}</svg></div>
          <div style="min-width:0">
            <div class="result-card__title">Текст</div>
            <div class="result-card__subtitle">${data.length} символов</div>
          </div>
        </div>
        <div class="result-card__body">
          <div class="result-text">${esc(data)}</div>
        </div>
        <div class="result-card__actions">
          <button class="btn btn--primary" data-copy="${esc(data)}">Копировать</button>
          <button class="btn btn--ghost" data-to-qr="${esc(data)}">Сделать QR</button>
        </div>
      </div>`;
  }
  box.innerHTML = html;

  box.querySelectorAll('[data-copy]').forEach(b=>{
    b.addEventListener('click',async()=>{
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Скопировано'); }
      catch(e){ toast('Не удалось скопировать'); }
    });
  });
  box.querySelectorAll('[data-to-qr]').forEach(b=>{
    b.addEventListener('click',()=>{
      const v = b.dataset.toQr;
      setType('text');
      const ta = $('#t_text'); if (ta) ta.value = v;
      switchView('gen');
      lastTextKey = '';
      doRender();
      toast('Перенесено в генератор');
    });
  });
}

let savedTheme = 'graphite';
try { savedTheme = localStorage.getItem('qrg:theme') || 'graphite'; } catch(e){}
applyTheme(savedTheme);

renderColorPickers();
renderHistory();
setType('url');
applyDesign();
syncUI();
updateLogoPreview();
updateCrumbsPill();
goStep(1);

setTimeout(()=>{
  if (!$('#t_url').value && !$('#t_text').value){
    $('#t_url').value = 'https://example.com';
  }
  doRender();
  const loader = document.getElementById('loader');
  loader.classList.add('is-hidden');
  setTimeout(()=>{ loader.style.display = 'none'; }, 600);
}, 400);

window.addEventListener('load', updateCrumbsPill);

}