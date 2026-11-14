import {joinRoom} from 'https://esm.sh/trystero@0.27.0'

/* ============ SABİTLER ============ */
const APP_ID = 'alihamza/yumruk-boks'
// Varsayılan relay listesinden appId ile seçilen 5 relay'in çoğu ölü — erişilebilir olanlar sabitlendi
const RELAYS = [
  'wss://relay.primal.net', 'wss://relay.nostr.com', 'wss://nos.lol',
  'wss://relay.snort.social', 'wss://nostr.azzamo.net', 'wss://bucket.coracle.social',
  'wss://relay.nostrhub.fr', 'wss://nostr.wine', 'wss://relay.guggero.org',
  'wss://relay.nostr.net', 'wss://nostrelay.circum.space', 'wss://nostr.data.haus',
  'wss://relay.nostr.info', 'wss://no.str.cr', 'wss://relay.angor.io',
  'wss://yabu.me', 'wss://nostr.overmind.lol'
]
const T = {
  START_HP: 100,
  DECIDE: 5000,        // saldırgan karar süresi
  DODGE_START: 450,    // dodge penceresi başlangıcı
  DODGE_END: 1150,     // dodge penceresi bitişi
  RESOLVE_AT: 1250,    // turun sonuçlanması
  PAUSE: 900,          // turlar arası bekleme
  BASE_DMG: 15,
  MAX_COMBO: 3,
  COMBO_BONUS: 3,
  COUNTER_DMG: 8,
  MOMENTUM_DMG: 7,
  TIMEOUT_DMG: 5,
  ACT_TIMEOUT: 12000
}
const ACTS = ['act-punch', 'act-fake', 'act-dodge', 'act-hit']
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const $ = id => document.getElementById(id)

/* ============ DOM ============ */
const screens = {
  menu: $('screen-menu'),
  lobby: $('screen-lobby'),
  fight: $('screen-fight')
}
const el = {
  nick: $('nick'), codeInput: $('code-input'), btnCreate: $('btn-create'),
  btnJoin: $('btn-join'), btnAi: $('btn-ai'), menuError: $('menu-error'),
  roomCode: $('room-code-display'), btnCopy: $('btn-copy'),
  btnCopyLink: $('btn-copy-link'), lobbyStatus: $('lobby-status'),
  slotHost: $('slot-host'), slotGuest: $('slot-guest'),
  btnStart: $('btn-start'), btnBack: $('btn-back'),
  hpMe: $('hp-me'), hpOpp: $('hp-opp'), pctMe: $('pct-me'), pctOpp: $('pct-opp'),
  nameMe: $('hud-name-me'), nameOpp: $('hud-name-opp'),
  badgesMe: $('badges-me'), badgesOpp: $('badges-opp'),
  turnLabel: $('turn-label'), banner: $('banner'),
  windowBar: $('window-bar'), wbFill: $('wb-fill'), wbZone: $('wb-zone'),
  callout: $('callout'), fxLayer: $('fx-layer'), ring: $('ring'),
  boxerMe: $('boxer-me'), boxerOpp: $('boxer-opp'),
  hint: $('controls-hint'), log: $('log'),
  overlayResult: $('overlay-result'), resultTitle: $('result-title'),
  resultSub: $('result-sub'), btnRematch: $('btn-rematch'), btnMenu: $('btn-menu'),
  overlayConn: $('overlay-conn'), connTitle: $('conn-title'),
  connSub: $('conn-sub'), btnConnMenu: $('btn-conn-menu'),
  st: {
    thrown: $('st-thrown'), landed: $('st-landed'), dodged: $('st-dodged'),
    fakes: $('st-fakes'), taken: $('st-taken')
  }
}

/* ============ DURUM ============ */
const S = {
  phase: 'menu',
  vsAI: false,
  room: null, msg: null, selfId: null, isHost: false,
  oppId: null, oppName: '', helloSent: false, joinTimer: null,
  code: '', myName: 'Şampiyon',
  hpMe: T.START_HP, hpOpp: T.START_HP,
  attackerId: null, seq: 0, turn: 0,
  my: {combo: 0, counter: false, momentum: false, off: false},
  opp: {combo: 0, counter: false, momentum: false, off: false},
  stats: {thrown: 0, landed: 0, dodged: 0, fakes: 0, taken: 0},
  timers: [], phaseToken: 0,
  acted: false, actKind: null, pendingAtk: null,
  defenseArmed: false, defenseBlocked: false,
  dodgeUsed: false, dodgeT0: 0, lastLoser: null, resetSent: false
}

function later(fn, ms) {
  const id = setTimeout(fn, ms)
  S.timers.push(id)
  return id
}
function clearTimers() {
  S.timers.forEach(clearTimeout)
  S.timers = []
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]))
}
function randomCode() {
  let out = ''
  const buf = new Uint32Array(6)
  crypto.getRandomValues(buf)
  for (let i = 0; i < 6; i++) out += ALPHABET[buf[i] % ALPHABET.length]
  return out
}

/* ============ SES ============ */
const Snd = {
  ctx: null,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { this.ctx = null }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  },
  tone(f0, f1, dur, type, gain, delay) {
    const c = this.ctx
    if (!c) return
    const t = c.currentTime + (delay || 0)
    const o = c.createOscillator(), g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g).connect(c.destination)
    o.start(t); o.stop(t + dur + 0.05)
  },
  noise(dur, freq, gain, delay) {
    const c = this.ctx
    if (!c) return
    const t = c.currentTime + (delay || 0)
    const n = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, n, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = c.createBufferSource()
    src.buffer = buf
    const f = c.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2
    const g = c.createGain()
    g.gain.value = gain
    src.connect(f).connect(g).connect(c.destination)
    src.start(t)
  },
  whoosh() { this.noise(0.2, 1400, 0.5) },
  thud() { this.tone(150, 40, 0.18, 'sine', 0.9); this.noise(0.12, 300, 0.7) },
  feint() { this.tone(900, 500, 0.08, 'square', 0.12) },
  ding() { this.tone(1300, 1290, 0.4, 'sine', 0.4); this.tone(1950, 1940, 0.4, 'sine', 0.2, 0.02) },
  bell() { this.ding(); this.ding() },
  ko() { this.tone(300, 45, 1.1, 'sawtooth', 0.6); this.noise(0.5, 200, 0.8) },
  click() { this.tone(1000, 700, 0.06, 'square', 0.12) },
  warn() { this.tone(600, 600, 0.08, 'square', 0.15) }
}

/* ============ FX ============ */
let calloutTimer = null
function callout(text, cls) {
  el.callout.className = 'callout'
  el.callout.textContent = text
  void el.callout.offsetWidth
  el.callout.className = 'callout show' + (cls ? ' ' + cls : '')
  clearTimeout(calloutTimer)
  calloutTimer = setTimeout(() => { el.callout.className = 'callout' }, 1000)
}
function log(msg, cls) {
  const d = document.createElement('div')
  d.className = 'log-line' + (cls ? ' ' + cls : '')
  d.textContent = msg
  el.log.prepend(d)
  while (el.log.children.length > 5) el.log.lastChild.remove()
}
function shake() {
  el.ring.classList.remove('shake')
  void el.ring.offsetWidth
  el.ring.classList.add('shake')
  setTimeout(() => el.ring.classList.remove('shake'), 450)
}
function fx(which, text) {
  const box = which === 'me' ? el.boxerMe : el.boxerOpp
  const x = box.offsetLeft + box.offsetWidth * 0.55
  const y = box.offsetTop + 58
  if (text) {
    const d = document.createElement('div')
    d.className = 'dmg-num'
    d.textContent = text
    d.style.left = x + 'px'
    d.style.top = y + 'px'
    el.fxLayer.append(d)
    d.addEventListener('animationend', () => d.remove())
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8 + Math.random() * 0.5
    const dist = 45 + Math.random() * 45
    const s = document.createElement('div')
    s.className = 'spark'
    s.style.left = x + 'px'
    s.style.top = y + 'px'
    s.style.setProperty('--dx', Math.round(Math.cos(a) * dist) + 'px')
    s.style.setProperty('--dy', Math.round(Math.sin(a) * dist) + 'px')
    el.fxLayer.append(s)
    s.addEventListener('animationend', () => s.remove())
  }
}
function animate(which, type) {
  const box = which === 'me' ? el.boxerMe : el.boxerOpp
  const inner = box.querySelector('.bx-inner')
  ACTS.forEach(c => inner.classList.remove(c))
  void inner.offsetWidth
  inner.classList.add('act-' + type)
  if (type !== 'ko') later(() => inner.classList.remove('act-' + type), 1400)
}

/* ============ UI ============ */
function showScreen(name) {
  for (const k in screens) {
    screens[k].hidden = k !== name
    screens[k].classList.toggle('active', k === name)
  }
}
function showMenuError(msg) {
  el.menuError.hidden = !msg
  el.menuError.textContent = msg || ''
}
function hpClass(v) { return v > 50 ? 'hp-hi' : v > 25 ? 'hp-mid' : 'hp-low' }
function renderHP() {
  const m = Math.max(0, S.hpMe), o = Math.max(0, S.hpOpp)
  el.hpMe.style.width = m + '%'
  el.hpOpp.style.width = o + '%'
  el.hpMe.className = 'hp-fill ' + hpClass(m)
  el.hpOpp.className = 'hp-fill ' + hpClass(o)
  el.pctMe.textContent = m
  el.pctOpp.textContent = o
}
function badgeHTML(o) {
  const parts = []
  if (o.combo > 1) parts.push('<span class="badge b-combo">×' + o.combo + ' KOMBO</span>')
  if (o.counter) parts.push('<span class="badge b-counter">KAÇAMAK +' + T.COUNTER_DMG + '</span>')
  if (o.momentum) parts.push('<span class="badge b-momentum">MOMENTUM +' + T.MOMENTUM_DMG + '</span>')
  if (o.off) parts.push('<span class="badge b-off">DENGESİZ!</span>')
  return parts.join('')
}
function renderBadges() {
  el.badgesMe.innerHTML = badgeHTML(S.my)
  el.badgesOpp.innerHTML = badgeHTML(S.opp)
}
function setBanner(main, sub, cls) {
  el.banner.className = 'banner' + (cls ? ' ' + cls : '')
  el.banner.innerHTML = '<b>' + esc(main) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '')
  void el.banner.offsetWidth
}
function setHint(html) { el.hint.innerHTML = html }
function hideHint() { el.hint.innerHTML = '' }
function windowBar(ms, mode, withZone) {
  el.windowBar.hidden = false
  el.windowBar.className = 'window-bar' + (mode ? ' ' + mode : '')
  el.wbZone.hidden = !withZone
  el.wbFill.style.transition = 'none'
  el.wbFill.style.width = '100%'
  void el.wbFill.offsetWidth
  el.wbFill.style.transition = 'width ' + ms + 'ms linear'
  el.wbFill.style.width = '0%'
}
function hideWindowBar() {
  el.windowBar.hidden = true
  el.wbFill.style.transition = 'none'
  el.wbFill.style.width = '100%'
}
function setSlot(slotEl, name, full) {
  slotEl.classList.toggle('full', !!full)
  slotEl.querySelector('.slot-name').textContent = name || ''
}
function renderLobbySlots() {
  setSlot(el.slotHost, S.isHost ? S.myName : (S.oppName || ''), true)
  setSlot(el.slotGuest, S.isHost ? (S.oppName || '') : S.myName, true)
}
function renderFightNames() {
  el.nameMe.textContent = (S.myName || 'SEN').toUpperCase()
  el.nameOpp.textContent = (S.oppName || 'RAKİP').toUpperCase()
}

/* ============ AĞ ============ */
function send(p) {
  if (S.vsAI) { AI.onSend(p); return }
  if (!S.msg) return
  S.msg.send(p).catch(err => showConn('Mesaj gönderilemedi', (err && err.message) || ''))
}
async function setupNetworking(code) {
  const room = joinRoom({appId: APP_ID, maxUsers: 2, identity: 'none', relayConfig: {urls: RELAYS}}, code)
  S.room = room
  try {
    const self = await room.getSelf()
    S.selfId = self.userId
  } catch (e) {
    showMenuError('Bağlantı kurulamadı, tekrar dene.')
    return
  }

  S.msg = room.makeAction('yumruk')
  S.msg.onMessage((data, meta) => onMsg(data, meta && meta.userId))

  room.onUserJoin(info => {
    if (S.oppId) return
    S.oppId = info.userId
    S.oppName = ''
    Snd.click()
    if (S.phase === 'lobby') {
      el.lobbyStatus.classList.remove('err')
      if (S.isHost) {
        el.lobbyStatus.textContent = 'Arkadaşın katıldı! Maçı başlatabilirsin.'
        el.btnStart.disabled = false
      } else {
        el.lobbyStatus.textContent = 'Bağlandın! Oda sahibi başlatacak...'
      }
    }
    if (!S.helloSent) {
      S.helloSent = true
      send({t: 'hello', name: S.myName})
    }
    renderLobbySlots()
  })

  room.onUserLeave(() => {
    S.oppId = null
    S.oppName = ''
    if (S.phase === 'fight' || S.phase === 'over') {
      showConn('RAKİP AYRILDI', 'Arkadaşın bağlantısı koptu. Maç yarım kaldı.')
    } else if (S.phase === 'lobby' && S.isHost) {
      el.lobbyStatus.classList.remove('err')
      el.lobbyStatus.textContent = 'Arkadaşın ayrıldı, yeniden bekleniyor'
      el.btnStart.disabled = true
      setSlot(el.slotGuest, '', false)
    } else if (S.phase === 'lobby' && !S.isHost) {
      showConn('ODA SAHİBİ AYRILDI', 'Oda kapandı, ana menüye dön.')
    }
  })

  room.onError(err => {
    const c = err && err.code
    if (S.phase === 'menu') {
      if (c === 'room-full') showMenuError('Bu oda dolu!')
      else if (c === 'bad-password') showMenuError('Oda kodu hatalı!')
      else if (c) showMenuError('Bağlantı hatası: ' + c)
    } else if (c) {
      showConn('BAĞLANTI HATASI', String(c))
    }
  })

  if (!S.isHost) {
    S.joinTimer = setTimeout(() => {
      if (S.phase === 'lobby' && !S.oppId) {
        el.lobbyStatus.classList.add('err')
        el.lobbyStatus.textContent = 'Oda bulunamadı! Kodu kontrol et.'
      }
    }, 8000)
  }
}

async function createGame() {
  if (S.phase !== 'menu') return
  Snd.init()
  Snd.click()
  S.myName = (el.nick.value || 'Şampiyon').slice(0, 12)
  S.isHost = true
  S.code = randomCode()
  S.phase = 'lobby'
  showMenuError('')
  showScreen('lobby')
  el.roomCode.textContent = S.code
  el.lobbyStatus.classList.remove('err')
  el.lobbyStatus.textContent = 'Arkadaşın katılmayı bekliyor'
  el.btnStart.disabled = true
  el.slotHost.classList.remove('full')
  el.slotGuest.classList.remove('full')
  renderLobbySlots()
  await setupNetworking(S.code)
}

async function joinGame() {
  if (S.phase !== 'menu') return
  Snd.init()
  Snd.click()
  const code = el.codeInput.value.trim().toUpperCase()
  if (code.length !== 6) {
    showMenuError('Oda kodu 6 haneli olmalı!')
    return
  }
  S.myName = (el.nick.value || 'Şampiyon').slice(0, 12)
  S.isHost = false
  S.code = code
  S.phase = 'lobby'
  showMenuError('')
  showScreen('lobby')
  el.roomCode.textContent = code
  el.lobbyStatus.classList.remove('err')
  el.lobbyStatus.textContent = 'Bağlanılıyor'
  el.btnStart.disabled = true
  renderLobbySlots()
  await setupNetworking(code)
}

function toMenu() {
  clearTimers()
  S.phaseToken++
  if (S.joinTimer) { clearTimeout(S.joinTimer); S.joinTimer = null }
  if (S.room) { try { S.room.leave() } catch (e) {} }
  S.room = null
  S.msg = null
  S.phase = 'menu'
  S.vsAI = false
  S.oppId = null
  S.oppName = ''
  S.helloSent = false
  S.code = ''
  S.resetSent = false
  el.overlayResult.hidden = true
  el.overlayConn.hidden = true
  showMenuError('')
  showScreen('menu')
}

function showConn(title, sub) {
  el.connTitle.textContent = title
  el.connSub.textContent = sub
  el.overlayConn.hidden = false
}

/* ============ AI RAKİP ============ */
const AI_NAMES = ['ŞAHİN', 'KASIRGA', 'DEMİR', 'GÖLGE', 'PANTHER']
const AI = {
  p: {punches: 0, fakes: 0, dodges: 0, faced: 0},
  punchDodged: false,
  reset() {
    this.p = {punches: 0, fakes: 0, dodges: 0, faced: 0}
    this.punchDodged = false
  },
  /* send() tarafından yakalanan oyuncu paketleri */
  onSend(d) {
    if (!d || !d.t) return
    if (d.t === 'act') {
      // oyuncu saldırdı — AI savunacak
      this.p[d.kind === 'fake' ? 'fakes' : 'punches']++
      const t0 = S.phaseToken
      const seq = d.seq
      const jitter = Math.floor(Math.random() * 200) - 100
      later(() => {
        if (S.phaseToken !== t0 || S.seq !== seq) return
        if (S.phase !== 'waitResolve' && S.phase !== 'fight') return
        if (S.attackerId !== S.selfId) return
        this.defend(d)
      }, T.RESOLVE_AT + jitter)
      return
    }
    if (d.t === 'resolve') {
      // AI saldırdı, oyuncu savundu — sonuç yerinde zaten uygulandı
      if (d.kind === 'punch') {
        this.p.faced++
        if (d.dodged) { this.p.dodges++; this.punchDodged = true }
        else this.punchDodged = false
      }
      return
    }
    // timeout-act / reset: durum yerinde zaten işlendi
  },
  /* AI savunması — resolveDefense'in aynası, AI tarafı için */
  defend(d) {
    const wasOff = S.opp.off
    S.opp.off = false
    const canDodge = !wasOff
    const dodge = canDodge && this.wantDodge(d.kind)
    let payload
    if (d.kind === 'punch') {
      const landed = !dodge
      let dmg = 0
      if (landed) {
        dmg = T.BASE_DMG + Math.min(d.combo, T.MAX_COMBO) * T.COMBO_BONUS +
          (d.counter ? T.COUNTER_DMG : 0) + (d.momentum ? T.MOMENTUM_DMG : 0)
      }
      if (!landed && canDodge) S.opp.counter = true
      payload = {
        t: 'resolve', seq: d.seq, kind: 'punch', dodged: !landed, landed: landed,
        dmg: dmg, hp: Math.max(0, S.hpOpp - dmg),
        defOff: S.opp.off, defCounter: S.opp.counter,
        atk: {combo: landed ? d.combo + 1 : 0, counter: false, momentum: false}
      }
    } else {
      if (dodge) S.opp.off = true
      payload = {
        t: 'resolve', seq: d.seq, kind: 'fake', dodged: dodge, landed: false,
        dmg: 0, hp: S.hpOpp,
        defOff: S.opp.off, defCounter: S.opp.counter,
        atk: {combo: d.combo, counter: d.counter, momentum: dodge ? d.momentum : true}
      }
    }
    applyResolve(payload)
  },
  wantDodge(kind) {
    const total = this.p.punches + this.p.fakes
    const ratio = total ? this.p.punches / total : 0.5
    // oyuncu çok yumruk atıyorsa daha çok dodge'lar, çok fake atıyorsa sahteye daha az düşer
    if (kind === 'fake') return Math.random() < 0.4 - 0.2 * ratio
    return Math.random() < 0.3 + 0.4 * ratio
  },
  /* AI saldırısı — beginExchange'de savunma tarafında çağrılır */
  planAttack() {
    const t0 = S.phaseToken
    const seq = S.seq
    later(() => {
      if (S.phaseToken !== t0 || S.phase !== 'fight' || S.seq !== seq) return
      if (S.attackerId === S.selfId || !S.vsAI) return
      const kind = this.decideAttack()
      onAct({t: 'act', seq: seq, kind: kind, combo: S.opp.combo, counter: S.opp.counter, momentum: S.opp.momentum})
    }, 700 + Math.floor(Math.random() * 1100))
  },
  decideAttack() {
    // oyuncu dengesizken kaçamaz — bedava vuruş
    if (S.my.off) return 'punch'
    if (this.punchDodged) { this.punchDodged = false; return 'fake' }
    if (this.p.faced >= 3 && this.p.dodges / this.p.faced > 0.6 && Math.random() < 0.7) return 'fake'
    if (S.opp.momentum && Math.random() < 0.75) return 'punch'
    return Math.random() < 0.65 ? 'punch' : 'fake'
  }
}

function startAIGame() {
  if (S.phase !== 'menu') return
  Snd.init()
  Snd.click()
  S.myName = (el.nick.value || 'Şampiyon').slice(0, 12)
  S.vsAI = true
  S.selfId = 'ai-local'
  S.oppId = 'ai-bot'
  S.oppName = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)].slice(0, 12)
  S.helloSent = true
  S.code = ''
  S.msg = null
  showMenuError('')
  AI.reset()
  startFight(S.selfId)
}

/* ============ MESAJ İŞLEME ============ */
function onMsg(d, from) {
  if (!d || !d.t) return
  if (d.t === 'hello') {
    if (from && !S.oppId) S.oppId = from
    S.oppName = String(d.name || 'RAKİP').slice(0, 12)
    if (S.phase === 'lobby' && !S.isHost) {
      el.lobbyStatus.classList.remove('err')
      el.lobbyStatus.textContent = 'Bağlandın! Oda sahibi başlatacak...'
    }
    renderLobbySlots()
    renderFightNames()
    if (!S.helloSent) {
      S.helloSent = true
      send({t: 'hello', name: S.myName})
    }
    return
  }
  if (d.t === 'start') {
    if (S.phase !== 'lobby') return
    startFight(d.attacker)
    return
  }
  if (d.t === 'act') { onAct(d); return }
  if (d.t === 'resolve') { applyResolve(d); return }
  if (d.t === 'timeout-act') { applyTimeoutAct(d); return }
  if (d.t === 'reset') {
    if (S.phase === 'over') {
      S.resetSent = false
      startFight(d.attacker)
    }
  }
}

/* ============ OYUN AKIŞI ============ */
function startFight(attackerId) {
  clearTimers()
  S.phaseToken++
  if (S.joinTimer) { clearTimeout(S.joinTimer); S.joinTimer = null }
  S.phase = 'fight'
  S.hpMe = T.START_HP
  S.hpOpp = T.START_HP
  S.seq = 0
  S.turn = 0
  S.attackerId = attackerId
  S.my = {combo: 0, counter: false, momentum: false, off: false}
  S.opp = {combo: 0, counter: false, momentum: false, off: false}
  S.stats = {thrown: 0, landed: 0, dodged: 0, fakes: 0, taken: 0}
  S.lastLoser = null
  S.resetSent = false
  S.actKind = null
  S.acted = false
  S.pendingAtk = null
  S.defenseArmed = false
  S.dodgeUsed = false
  el.overlayResult.hidden = true
  el.overlayConn.hidden = true
  el.log.innerHTML = ''
  el.boxerMe.classList.remove('no-bob')
  el.boxerOpp.classList.remove('no-bob')
  ACTS.concat(['act-ko']).forEach(c => {
    el.boxerMe.querySelector('.bx-inner').classList.remove(c)
    el.boxerOpp.querySelector('.bx-inner').classList.remove(c)
  })
  hideWindowBar()
  hideHint()
  renderHP()
  renderBadges()
  renderFightNames()
  showScreen('fight')
  Snd.bell()
  log('Maç başladı! 🥊', 'gold')
  const t0 = S.phaseToken
  later(() => { if (S.phaseToken === t0) beginExchange(1) }, 900)
}

function beginExchange(seq) {
  if (seq <= S.seq) return
  if (S.phase !== 'fight' && S.phase !== 'waitResolve') return
  S.phase = 'fight'
  S.seq = seq
  S.turn = seq
  S.actKind = null
  S.acted = false
  S.pendingAtk = null
  S.defenseArmed = false
  S.defenseBlocked = false
  S.dodgeUsed = false
  el.turnLabel.textContent = 'TUR ' + seq
  hideWindowBar()
  if (S.attackerId === S.selfId) {
    setBanner('SALDIRIYOR!', 'E: YUMRUK · Q: FAKE', 'atk')
    setHint('<kbd>E</kbd> YUMRUK &nbsp; <kbd>Q</kbd> FAKE')
    windowBar(T.DECIDE, '', false)
    later(() => { if (S.actKind === null && S.attackerId === S.selfId && S.phase === 'fight') doAct('timeout') }, T.DECIDE)
  } else {
    setBanner('RAKİP HAZIRLANIYOR', 'SAVUNMA HAZIR', 'def')
    setHint('Rakip hamlesi bekleniyor...')
    if (S.vsAI) AI.planAttack()
  }
}

function doAct(kind) {
  if (S.phase !== 'fight' || S.attackerId !== S.selfId || S.actKind) return
  S.actKind = kind
  S.acted = true
  hideWindowBar()

  if (kind === 'timeout') {
    S.hpMe = Math.max(0, S.hpMe - T.TIMEOUT_DMG)
    S.stats.taken += T.TIMEOUT_DMG
    renderHP()
    animate('me', 'punch')
    Snd.warn()
    callout('TEMKİN! −' + T.TIMEOUT_DMG, 'bad')
    log('Karar veremedin! Rakip bedava jab attı (−' + T.TIMEOUT_DMG + ')', 'bad')
    send({t: 'timeout-act', seq: S.seq, hp: S.hpMe})
    if (S.hpMe <= 0) { endFight(S.oppId); return }
    finishExchange()
    return
  }

  if (kind === 'punch') S.stats.thrown++
  if (kind === 'fake') S.stats.fakes++
  S.phase = 'waitResolve'
  animate('me', kind === 'punch' ? 'punch' : 'fake')
  if (kind === 'fake') Snd.feint()
  send({
    t: 'act', seq: S.seq, kind: kind,
    combo: S.my.combo, counter: S.my.counter, momentum: S.my.momentum
  })

  const t0 = S.phaseToken
  const seqAtAct = S.seq
  setTimeout(() => {
    if (S.phaseToken !== t0 || S.seq !== seqAtAct) return
    if (S.phase === 'waitResolve' && S.actKind === kind) {
      showConn('BAĞLANTI KOPTU', 'Rakipten yanıt gelmedi.')
    }
  }, T.ACT_TIMEOUT)
}

function onAct(d) {
  if (S.phase !== 'fight') return
  if (S.attackerId === S.selfId) return
  if (d.seq > S.seq) {
    const t0 = S.phaseToken
    clearTimers()
    S.phaseToken = t0
    beginExchange(d.seq)
  }
  if (d.seq !== S.seq || S.actKind) return
  S.actKind = d.kind
  S.pendingAtk = d
  S.opp.combo = d.combo
  S.opp.counter = d.counter
  S.opp.momentum = d.momentum
  renderBadges()

  animate('opp', d.kind === 'punch' ? 'punch' : 'fake')
  if (d.kind === 'fake') Snd.feint()

  S.defenseBlocked = !!S.my.off
  if (S.defenseBlocked) {
    setBanner('DENGESİZ!', 'KAÇAMAZSIN!', 'danger')
    setHint('Bu tur dodge yok!')
    windowBar(T.RESOLVE_AT, 'red', false)
    callout('DENGESİZ!', 'bad')
    Snd.warn()
  } else {
    setBanner('SAVUN!', 'BOŞLUK İLE KAÇIN', 'def')
    setHint('<kbd>SPACE</kbd> DODGE — ŞİMDİ!')
    windowBar(T.RESOLVE_AT, 'green', true)
  }

  S.defenseArmed = true
  S.dodgeT0 = performance.now()
  const t0 = S.phaseToken
  setTimeout(() => {
    if (S.phaseToken !== t0) return
    if (S.defenseArmed && S.actKind === d.kind) resolveDefense()
  }, T.RESOLVE_AT)
}

function resolveDefense() {
  if (S.phase !== 'fight' || !S.pendingAtk) return
  const d = S.pendingAtk
  S.defenseArmed = false
  hideWindowBar()
  const wasOff = S.my.off
  S.my.off = false

  let payload
  if (d.kind === 'punch') {
    const landed = !S.dodgeUsed && !wasOff
    let dmg = 0
    if (landed) {
      dmg = T.BASE_DMG + Math.min(d.combo, T.MAX_COMBO) * T.COMBO_BONUS +
        (d.counter ? T.COUNTER_DMG : 0) + (d.momentum ? T.MOMENTUM_DMG : 0)
    }
    S.hpMe = Math.max(0, S.hpMe - dmg)
    S.stats.taken += dmg
    if (S.dodgeUsed) S.stats.dodged++
    if (!landed && !wasOff) S.my.counter = true

    S.opp.combo = landed ? d.combo + 1 : 0
    S.opp.counter = false
    S.opp.momentum = false

    payload = {
      t: 'resolve', seq: d.seq, kind: 'punch', dodged: !landed, landed: landed,
      dmg: dmg, hp: S.hpMe, defOff: S.my.off, defCounter: S.my.counter,
      atk: {combo: S.opp.combo, counter: false, momentum: false}
    }

    if (landed) {
      animate('me', 'hit')
      fx('me', '-' + dmg)
      Snd.thud()
      shake()
      const comboTxt = S.opp.combo > 1 ? ' — ×' + S.opp.combo + ' KOMBO!' : ''
      callout('GİRDİ! −' + dmg, 'bad')
      log('Rakip sana vurdu (−' + dmg + ')' + comboTxt, 'bad')
    } else {
      Snd.whoosh()
      callout('KAÇTIN!', 'good')
      log('Rakip yumruğunu kaçırdın! Kontra kazandın (+' + T.COUNTER_DMG + ')', 'good')
    }
  } else {
    const dodged = S.dodgeUsed && !wasOff
    if (dodged) {
      S.stats.dodged++
      S.my.off = true
      callout('SAHTEYE KANDIN!', 'bad')
      log('Fake\'e kandın! Bir sonraki turda kaçamazsın', 'bad')
    } else {
      callout('BOŞA GİTTİ!', 'good')
      log('Fake boşa gitti — rakip momentum kazandı', 'good')
    }
    S.opp.combo = d.combo
    S.opp.counter = d.counter
    S.opp.momentum = dodged ? d.momentum : true
    payload = {
      t: 'resolve', seq: d.seq, kind: 'fake', dodged: dodged, landed: false,
      dmg: 0, hp: S.hpMe, defOff: S.my.off, defCounter: S.my.counter,
      atk: {combo: S.opp.combo, counter: S.opp.counter, momentum: S.opp.momentum}
    }
  }

  S.pendingAtk = null
  S.actKind = null
  renderHP()
  renderBadges()
  send(payload)
  if (S.hpMe <= 0) { endFight(S.oppId); return }
  finishExchange()
}

function applyResolve(d) {
  if (S.phase !== 'fight' && S.phase !== 'waitResolve') return
  if (d.seq !== S.seq || S.attackerId !== S.selfId) return

  S.hpOpp = Math.max(0, d.hp)
  S.my.combo = d.atk.combo
  S.my.counter = d.atk.counter
  S.my.momentum = d.atk.momentum
  S.opp.off = !!d.defOff
  S.opp.counter = !!d.defCounter

  if (d.kind === 'punch') {
    if (d.landed) {
      S.stats.landed++
      animate('opp', 'hit')
      fx('opp', '-' + d.dmg)
      Snd.thud()
      shake()
      const comboTxt = S.my.combo > 1 ? ' — ×' + S.my.combo + ' KOMBO!' : ''
      callout('GİRDİ! −' + d.dmg, 'good')
      log('Rakibi vurdun (−' + d.dmg + ')' + comboTxt, 'good')
    } else {
      Snd.whoosh()
      callout('RAKİP KAÇTI!', 'bad')
      log('Rakip yumruğunu kaçırdı', 'bad')
    }
  } else {
    if (d.dodged) {
      callout('RAKİP SAHTEYE KANDI!', 'good')
      log('Fake\'e kandı! Bir sonraki turda kaçamaz', 'good')
    } else {
      callout('BOŞA GİTTİ!', 'bad')
      log('Fake boşa gitti — rakip momentum kazandı', 'bad')
    }
    S.opp.off = !!d.defOff
  }

  renderHP()
  renderBadges()
  if (S.hpOpp <= 0) { endFight(S.selfId); return }
  finishExchange()
}

function applyTimeoutAct(d) {
  if (S.phase !== 'fight') return
  if (d.seq !== S.seq || S.attackerId === S.selfId) return
  S.hpOpp = Math.max(0, d.hp)
  renderHP()
  animate('me', 'hit')
  fx('me', '-' + T.TIMEOUT_DMG)
  Snd.thud()
  shake()
  callout('RAKİP TEMKİNLİ! −' + T.TIMEOUT_DMG, 'good')
  log('Rakip karar veremedi, bedava jab yedi (−' + T.TIMEOUT_DMG + ')', 'good')
  if (S.hpOpp <= 0) { endFight(S.selfId); return }
  finishExchange()
}

function finishExchange() {
  if (S.phase !== 'fight' && S.phase !== 'waitResolve') return
  S.attackerId = S.attackerId === S.selfId ? S.oppId : S.selfId
  const t0 = S.phaseToken
  const next = S.seq + 1
  later(() => { if (S.phaseToken === t0) beginExchange(next) }, T.PAUSE)
}

function endFight(winnerId) {
  if (S.phase !== 'fight' && S.phase !== 'waitResolve') return
  S.phase = 'over'
  const won = winnerId === S.selfId
  S.lastLoser = won ? S.oppId : S.selfId
  const loserWhich = won ? 'opp' : 'me'
  animate(loserWhich, 'ko')
  el.boxerMe.classList.add('no-bob')
  el.boxerOpp.classList.add('no-bob')
  Snd.ko()
  shake()
  callout('K.O.!', 'big')
  log(won ? 'K.O.! Rakibi nakavt ettin! 🏆' : 'K.O.! Nakavt oldun...', won ? 'gold' : 'bad')
  setBanner(won ? 'KAZANDIN!' : 'KAYBETTİN', '', won ? 'atk' : 'danger')
  hideHint()
  hideWindowBar()
  const t0 = S.phaseToken
  later(() => { if (S.phaseToken === t0 && S.phase === 'over') showResult(won) }, 1500)
}

function showResult(won) {
  el.resultTitle.textContent = won ? 'KAZANDIN! 🏆' : 'KAYBETTİN!'
  el.resultTitle.className = 'result-title' + (won ? '' : ' lose')
  el.resultSub.textContent = won
    ? 'Rakibi K.O. ettin: ' + (S.oppName || 'Rakip')
    : (S.oppName || 'Rakip') + ' seni nakavt etti'
  el.st.thrown.textContent = S.stats.thrown
  el.st.landed.textContent = S.stats.landed
  el.st.dodged.textContent = S.stats.dodged
  el.st.fakes.textContent = S.stats.fakes
  el.st.taken.textContent = S.stats.taken
  el.overlayResult.hidden = false
}

function rematch() {
  if (S.phase !== 'over' || S.resetSent) return
  S.resetSent = true
  Snd.click()
  send({t: 'reset', attacker: S.lastLoser})
  startFight(S.lastLoser)
}

/* ============ GİRDİ ============ */
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return
  if (e.code === 'Space' && S.phase === 'fight') e.preventDefault()
  if (e.repeat) return
  if (e.code === 'KeyR' && S.phase === 'over') { rematch(); return }
  if (S.phase !== 'fight') return

  if (e.code === 'KeyE' && S.attackerId === S.selfId) {
    doAct('punch')
  } else if (e.code === 'KeyQ' && S.attackerId === S.selfId) {
    doAct('fake')
  } else if (e.code === 'Space' && S.defenseArmed && S.pendingAtk) {
    if (S.defenseBlocked) { callout('DENGESİZ!', 'bad'); return }
    if (S.dodgeUsed) return
    const dt = performance.now() - S.dodgeT0
    if (dt >= T.DODGE_START && dt <= T.DODGE_END) {
      S.dodgeUsed = true
      animate('me', 'dodge')
      Snd.whoosh()
      el.wbZone.classList.remove('flash')
      void el.wbZone.offsetWidth
      el.wbZone.classList.add('flash')
    } else if (dt < T.DODGE_START) {
      Snd.warn()
    }
  }
})

/* ============ BAĞLAYICILAR ============ */
el.btnCreate.addEventListener('click', createGame)
el.btnJoin.addEventListener('click', joinGame)
el.btnAi.addEventListener('click', startAIGame)

el.btnCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(S.code)
    el.btnCopy.textContent = '✅ KOPYALANDI'
    setTimeout(() => { el.btnCopy.textContent = '📋 KODU KOPYALA' }, 1500)
  } catch (e) {
    el.btnCopy.textContent = 'KOD: ' + S.code
  }
})

el.btnCopyLink.addEventListener('click', async () => {
  const url = location.origin + location.pathname + '?oda=' + S.code
  try {
    await navigator.clipboard.writeText(url)
    el.btnCopyLink.textContent = '✅ LİNK KOPYALANDI'
    setTimeout(() => { el.btnCopyLink.textContent = '🔗 DAVET LİNKİNİ KOPYALA' }, 1500)
  } catch (e) {
    el.btnCopyLink.textContent = url
  }
})

el.btnStart.addEventListener('click', () => {
  if (!S.isHost || S.phase !== 'lobby' || !S.oppId) return
  Snd.click()
  el.btnStart.disabled = true
  el.lobbyStatus.textContent = 'Maç başlatılıyor...'
  send({t: 'start', attacker: S.selfId})
  startFight(S.selfId)
})

el.btnBack.addEventListener('click', () => { Snd.click(); toMenu() })
el.btnMenu.addEventListener('click', () => { Snd.click(); toMenu() })
el.btnConnMenu.addEventListener('click', () => { Snd.click(); toMenu() })
el.btnRematch.addEventListener('click', rematch)

el.nick.addEventListener('keydown', e => {
  if (e.key === 'Enter') createGame()
})
el.codeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') joinGame()
})
el.codeInput.addEventListener('input', () => {
  el.codeInput.value = el.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
})

/* ============ BAŞLANGIÇ ============ */
const params = new URLSearchParams(location.search)
const oda = (params.get('oda') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
if (oda) {
  el.codeInput.value = oda
  el.nick.focus()
} else {
  el.nick.focus()
}
renderHP()
