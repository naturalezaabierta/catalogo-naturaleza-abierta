/* Naturaleza Abierta · tienda · código compartido */
const NA = (function(){
  const SB_URL = 'https://tgvcvnhrwswuxgjbpvwq.supabase.co';
  const SB_KEY = 'sb_publishable_EKV8OM1y96u-DV_kUPGwkg_BZuGdf4D';
  const WA = '584221482602';
  // Webhook de Make que verifica el pago (escenario "Tienda - Verificar pago de pedido")
  const HOOK_VERIFICAR = 'https://hook.us2.make.com/baqlt9zujh2w5mkwir91z1atthbwrz1d';
  // Webhook de Make que manda correos después de guardar envío / afiliado
  const HOOK_CORREOS = 'https://hook.us2.make.com/hk5jo1q5py83i8fve5trruu19fvjwbdj';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tryJ = (f, d) => { try { return f(); } catch(e){ return d; } };
  const store = {
    get(k, d){ return tryJ(()=>{ const v = localStorage.getItem(k); return v==null?d:JSON.parse(v); }, d); },
    set(k, v){ tryJ(()=>localStorage.setItem(k, JSON.stringify(v))); },
    del(k){ tryJ(()=>localStorage.removeItem(k)); }
  };

  async function rpc(fn, args){
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method:'POST',
      headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_KEY},
      body: JSON.stringify(args||{})
    });
    if(!r.ok){ let t=''; try{ t = await r.text(); }catch(e){} throw new Error(fn+' '+r.status+' '+t); }
    const j = await r.json();
    return j;
  }
  async function hook(url, payload){
    try { await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}); return true; }
    catch(e){ return false; }
  }

  /* ---------- Referido (?ref=NA-12345 o teléfono) ---------- */
  function initRef(){
    const p = new URLSearchParams(location.search).get('ref');
    let ref = store.get('na_ref', '');
    if(p){
      const v = p.trim().toUpperCase();
      if(/^NA-\d{5}$/.test(v)) ref = v;
      else { const d = v.replace(/\D/g,''); if(d.length>=10) ref = 'NA-'+d.slice(-5); }
      if(ref) store.set('na_ref', ref);
    }
    const b = $('#refBanner');
    if(b && ref){ b.textContent = `Estás comprando con el código de referido ${ref}`; b.classList.add('show'); }
    return ref;
  }
  const getRef = () => store.get('na_ref','') || null;

  /* ---------- Formato ---------- */
  const state = { tasa: null };
  const fmtUsd = n => '$' + (Math.round(Number(n||0)*100)/100).toFixed(2).replace(/\.00$/,'');
  const fmtBs = n => state.tasa ? 'Bs ' + (Number(n||0)*state.tasa).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
  const pct = v => { const n = Number(v); if(!isFinite(n)||n<=0) return null; return Math.round((n<=1?n*100:n)*100)/100; };
  const bsLine = n => state.tasa ? `<small>≈ ${fmtBs(n)}</small>` : '';

  /* ---------- Catálogo ---------- */
  async function catalogo(){
    const c = tryJ(()=>JSON.parse(sessionStorage.getItem('na_cat')), null);
    if(c && Date.now()-c.t < 5*60*1000){ state.tasa = c.d.tasa_bcv; return c.d; }
    const d = await rpc('fn_catalogo_publico');
    state.tasa = Number(d.tasa_bcv) || null;
    tryJ(()=>sessionStorage.setItem('na_cat', JSON.stringify({t:Date.now(), d})));
    return d;
  }
  const imgOf = x => x.imagen_url || 'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#E4E2D6"/></svg>');

  /* ---------- Extras de la tienda: banner y galerías (fn_tienda_extra) ---------- */
  async function extra(){
    const c = tryJ(()=>JSON.parse(sessionStorage.getItem('na_extra')), null);
    if(c && Date.now()-c.t < 2*60*1000) return c.d;
    let d = {ajustes:{}, medios:{}};
    try{ d = await rpc('fn_tienda_extra'); }catch(e){}
    tryJ(()=>sessionStorage.setItem('na_extra', JSON.stringify({t:Date.now(), d})));
    return d;
  }
  // Lista de fotos y videos de un producto/experiencia (primero la galería, si no la foto y video principales)
  function medios(ex, item){
    let L = (ex && ex.medios && ex.medios[item.id]) || [];
    if(!L.length){ if(item.imagen_url) L.push({tipo:'imagen',url:item.imagen_url}); if(item.video_url) L.push({tipo:'video',url:item.video_url}); }
    return L;
  }
  function videoHtml(url){
    const y = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if(y) return `<iframe src="https://www.youtube.com/embed/${y[1]}" allowfullscreen loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px"></iframe>`;
    return `<video src="${esc(url)}" controls playsinline preload="metadata" style="width:100%;border-radius:12px;background:#000"></video>`;
  }
  const comisiones = it => [1,2,3,4].map(n=>pct(it['comision_n'+n]));

  /* ---------- Carrito (solo productos; la experiencia se reserva aparte) ---------- */
  const cart = {
    all(){ return store.get('na_cart', {}); },
    set(c){ store.set('na_cart', c); cart.badge(); },
    add(id, n=1){ const c = cart.all(); c[id] = Math.min(20, (c[id]||0)+n); if(c[id]<=0) delete c[id]; cart.set(c); },
    setQty(id, q){ const c = cart.all(); if(q<=0) delete c[id]; else c[id]=Math.min(20,q); cart.set(c); },
    clear(){ store.del('na_cart'); cart.badge(); },
    count(){ return Object.values(cart.all()).reduce((a,b)=>a+b,0); },
    badge(){ $$('.cartcount').forEach(e=>e.textContent = cart.count()); }
  };

  /* ---------- Pixel de Meta ---------- */
  function pixel(){
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init','1058891023827887'); fbq('track','PageView');
  }
  const track = (ev, data, custom) => { if(window.fbq) custom ? fbq('trackCustom',ev,data) : fbq('track',ev,data); };

  /* ---------- Encabezado / pie ---------- */
  function chrome(){
    const h = $('#top');
    if(h) h.innerHTML = `<div class="wrap"><a class="brand" href="index.html">Naturaleza Abierta</a><nav class="nav"><a href="index.html#productos">Productos</a><a href="index.html#experiencias">Experiencias</a><a href="index.html#referidos">Gana refiriendo</a></nav><a class="cartbtn" href="carrito.html">Mi pedido <b class="cartcount">0</b></a></div>`;
    const f = $('#foot');
    if(f) f.innerHTML = `<div class="wrap">© Naturaleza Abierta · <a href="https://wa.me/${WA}" target="_blank" rel="noopener">Hablar con Valentina por WhatsApp</a></div>`;
    cart.badge();
  }
  function waLink(texto){ return `https://wa.me/${WA}?text=${encodeURIComponent(texto)}`; }
  const qs = k => new URLSearchParams(location.search).get(k);
  function copiar(t, btn){ tryJ(()=>navigator.clipboard.writeText(t)); if(btn){ const o=btn.textContent; btn.textContent='Copiado'; setTimeout(()=>btn.textContent=o,1200);} }
  const soloDig = s => String(s||'').replace(/\D/g,'');
  function showMsg(el, tipo, txt){ el.className='msg show '+tipo; el.textContent = txt; }
  function hideMsg(el){ el.className='msg'; }

  function init(){ pixel(); chrome(); initRef(); }
  return {$, $$, esc, rpc, hook, store, init, getRef, state, fmtUsd, fmtBs, bsLine, pct, catalogo, extra, medios, videoHtml, comisiones, imgOf, cart, track, waLink, qs, copiar, soloDig, showMsg, hideMsg, WA, HOOK_VERIFICAR, HOOK_CORREOS, SB_URL};
})();
