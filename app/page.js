'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

function StarRating({ rating, onRate, size = 32, interactive = true }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} onClick={() => interactive && onRate?.(star)}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{ background: 'none', border: 'none', cursor: interactive ? 'pointer' : 'default',
            fontSize: size, padding: 0, lineHeight: 1,
            color: star <= (hover || rating) ? '#FFB500' : '#D5D5D5',
            transform: star <= (hover || rating) ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.15s ease' }}>★</button>
      ))}
    </div>
  )
}

function ScoreBar({ score, max = 5 }) {
  const pct = (score / max) * 100
  const color = score >= 4 ? '#0A7D3E' : score >= 3 ? '#B4770A' : '#C10E21'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ flex: 1, height: 8, background: '#EFEFEF', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.8s ease' }} />
      </div>
      <span style={{ fontWeight: 700, fontSize: 15, color, minWidth: 32, textAlign: 'right' }}>
        {score > 0 ? score.toFixed(1) : '—'}
      </span>
    </div>
  )
}

async function hashTrackingNumber(t) {
  const d = new TextEncoder().encode(t.trim().toUpperCase())
  const h = await crypto.subtle.digest('SHA-256', d)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function formatDate(s) {
  if (!s) return null
  try { return new Date(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return null }
}

function deliveryTier(p) {
  if (p.delivery_days == null) return { cls: 'gray', label: 'Kayıt Tamamlandı' }
  if (p.delivery_days <= 1) return { cls: 'green', label: 'Hızlı Teslimat' }
  if (p.delivery_days <= 3) return { cls: 'yellow', label: 'Zamanında' }
  return { cls: 'red', label: 'Geç Teslimat' }
}

function norm(s) {
  return (s || '').toLowerCase()
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]/g, '')
}

// AfterShip kurye kodu bizim firma isimlerimizle birebir eşleşmeyebilir
// (ör. "dhl-global-mail-api" → "DHL eCommerce Türkiye"). Test ettikçe bu
// tabloyu büyütüyoruz.
const KNOWN_CODE_ALIASES = {
  'dhl-global-mail-api': 'dhl ecommerce turkiye',
  'dhl-ecommerce': 'dhl ecommerce turkiye',
  'dhl-ecommerce-tr': 'dhl ecommerce turkiye',
  'mng-kargo': 'dhl ecommerce turkiye',
}

// Kullanıcı elle bir firma seçtiğinde AfterShip'e "bu numara şu kuryeye ait"
// diye zorlayabilmek için tahmini AfterShip kurye kodları (slug). Kesin
// doğrulanmamış olanlar var — test ettikçe düzeltiyoruz.
const CARRIER_SLUG_HINTS = {
  'aras kargo': 'aras-kargo',
  'yurtici kargo': 'yurtici-kargo',
  'ptt kargo': 'ptt-kargo',
  'surat kargo': 'surat-kargo',
  'trendyol express': 'trendyol-express',
  'hepsijet': 'hepsijet',
  'sendeo': 'sendeo',
  'kolay gelsin': 'kolay-gelsin',
  'dhl ecommerce turkiye': 'dhl-global-mail-api',
}

export default function Home() {
  const [screen, setScreen] = useState('landing') // 'landing' | 'app'
  const [tab, setTab] = useState('list') // 'list' | 'scores' | 'profile'
  const [flow, setFlow] = useState(null) // null | 'add' | 'select_carrier' | 'rate' | 'detail'
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMode, setLoginMode] = useState('register')
  const [authError, setAuthError] = useState('')
  const [trackingNo, setTrackingNo] = useState('')
  const [trackingError, setTrackingError] = useState('')
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [trackingData, setTrackingData] = useState(null)
  const [selectedCarrierId, setSelectedCarrierId] = useState(null)
  const [selectedCarrierInfo, setSelectedCarrierInfo] = useState(null)
  const [addSelectedCarrierId, setAddSelectedCarrierId] = useState(null)
  const [carrierSearch, setCarrierSearch] = useState('')
  const [rating, setRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [ratingError, setRatingError] = useState('')
  const [carriers, setCarriers] = useState([])
  const [scores, setScores] = useState([])
  const [sourceNote, setSourceNote] = useState('')
  const [myParcels, setMyParcels] = useState([])
  const [myParcelsLoading, setMyParcelsLoading] = useState(false)
  const [detailParcel, setDetailParcel] = useState(null)
  const [kebabOpen, setKebabOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [resetError, setResetError] = useState('')
  const [debugApi, setDebugApi] = useState(null)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const recoveryModeRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !recoveryModeRef.current) { setUser(session.user); setScreen('app') }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { recoveryModeRef.current = true; setScreen('reset_password'); return }
      if (recoveryModeRef.current) return // sıfırlama ekranındayken diğer auth olaylarını yok say
      if (session?.user) { setUser(session.user); setScreen('app') }
      else { setUser(null); setScreen('landing') }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleForgotPassword(e) {
    e.preventDefault(); setAuthError('')
    if (!forgotEmail.trim()) { setAuthError('E-posta adresini girin.'); return }
    setForgotSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : '',
    })
    setForgotSubmitting(false)
    if (error) { setAuthError(error.message); return }
    setForgotSent(true)
  }

  async function handleSetNewPassword(e) {
    e.preventDefault(); setResetError('')
    if (!newPassword || newPassword.length < 6) { setResetError('Şifre en az 6 karakter olmalı.'); return }
    if (newPassword !== newPassword2) { setResetError('Şifreler eşleşmiyor.'); return }
    setResetSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setResetSubmitting(false)
    if (error) { setResetError(error.message); return }
    setResetSuccess(true)
    setNewPassword(''); setNewPassword2('')
    recoveryModeRef.current = false
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) setUser(session.user)
    setTimeout(() => { setResetSuccess(false); setScreen('app') }, 1800)
  }

  useEffect(() => { loadScores(); loadCarriers() }, [])
  useEffect(() => { if (user && screen === 'app') loadMyParcels() }, [user, screen])

  async function loadScores() {
    const { data } = await supabase.from('carrier_scores').select('*')
    if (data) setScores(data)
  }
  async function loadCarriers() {
    const { data } = await supabase.from('carriers').select('*').eq('is_active', true).order('name')
    if (data) setCarriers(data)
  }

  async function handleRegister(e) {
    e.preventDefault(); setAuthError('')
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) { setAuthError('Tüm alanları doldurun.'); return }
    if (password.length < 6) { setAuthError('Şifre en az 6 karakter olmalı.'); return }
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) { setAuthError(error.message); return }
    if (data.user) await supabase.from('profiles').insert({ id: data.user.id, first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() })
  }

  async function handleLogin(e) {
    e.preventDefault(); setAuthError('')
    if (!email.trim() || !password.trim()) { setAuthError('E-posta ve şifre girin.'); return }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setAuthError('E-posta veya şifre hatalı.')
  }

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : '' } })
    if (error) setAuthError(error.message)
  }

  async function handleLogout() { await supabase.auth.signOut() }

  function openAddFlow() {
    setTrackingNo(''); setTrackingError(''); setTrackingData(null); setSourceNote('')
    setAddSelectedCarrierId(null); setCarrierSearch(''); setRating(0); setRatingError('')
    setFlow('add')
  }

  async function handleTrackingSubmit(e) {
    e.preventDefault()
    if (!trackingNo.trim()) return
    setTrackingError(''); setTrackingLoading(true); setTrackingData(null)
    try {
      const hash = await hashTrackingNumber(trackingNo)
      const { data: alreadyUsed } = await supabase.rpc('check_tracking_used', { hash })
      if (alreadyUsed) { setTrackingError('Bu takip numarası daha önce değerlendirilmiş.'); setTrackingLoading(false); return }

      let json = null
      let apiData = null
      try {
        const res = await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackingNumber: trackingNo.trim() }) })
        json = await res.json()
        if (json.verified && json.eventCount > 0) apiData = json
      } catch (apiErr) { console.error('API error:', apiErr) }

      setDebugApi(json)
      setTrackingData(apiData)

      // Kargo firmasını otomatik tanımaya çalış — checkpoint verisi (apiData) henüz
      // gelmemiş olsa bile AfterShip genelde firmayı hemen (courierCode/courierName) tanır,
      // o yüzden 'verified' beklemeden json'dan da eşleştirmeyi dene.
      let matched = null
      const rawCode = (json?.courierCode || '').toLowerCase()
      if (KNOWN_CODE_ALIASES[rawCode]) {
        const na = norm(KNOWN_CODE_ALIASES[rawCode])
        matched = carriers.find(c => { const nc = norm(c.name); return nc.includes(na) || na.includes(nc) })
      }
      if (!matched) {
        const guess = json?.courierName || json?.courierCode
        if (guess) {
          const ng = norm(guess)
          matched = carriers.find(c => { const nc = norm(c.name); return ng && nc && (nc.includes(ng) || ng.includes(nc)) })
        }
      }
      if (!matched && addSelectedCarrierId) matched = carriers.find(c => c.id === addSelectedCarrierId)

      if (matched) {
        setSelectedCarrierId(matched.id); setSelectedCarrierInfo(matched); setFlow('rate')
      } else {
        setFlow('select_carrier')
      }
    } catch (err) { console.error(err); setTrackingError('Bir hata oluştu, tekrar deneyin.') }
    setTrackingLoading(false)
  }

  async function handleCarrierSelect(carrier) {
    setSelectedCarrierId(carrier.id); setSelectedCarrierInfo(carrier)

    // Bilinen bir AfterShip kurye koduna sahipsek, doğru firmayla tekrar
    // sorgulamayı dene — belki bu sefer gerçek hareket verisini yakalarız.
    const slug = CARRIER_SLUG_HINTS[norm(carrier.name)]
    if (slug) {
      setTrackingLoading(true)
      try {
        const res = await fetch('/api/track', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingNumber: trackingNo.trim(), slug }),
        })
        const json2 = await res.json()
        setDebugApi(json2)
        if (json2.verified && json2.eventCount > 0) setTrackingData(json2)
      } catch (err) { console.error('Retry error:', err) }
      setTrackingLoading(false)
    }

    setFlow('rate')
  }

  async function handleRatingSubmit() {
    if (rating === 0 || !selectedCarrierId || !user || ratingSubmitting) return
    setRatingSubmitting(true)
    setRatingError('')
    const hash = await hashTrackingNumber(trackingNo)
    const ins = { user_id: user.id, carrier_id: selectedCarrierId, tracking_number_hash: hash, tracking_number: trackingNo.trim(),
      source_note: sourceNote.trim() || null, score: rating,
      origin_city: trackingData?.originCity || null, destination_city: trackingData?.destinationCity || null, delivery_days: trackingData?.deliveryDays || null }
    if (trackingData?.pickupDate) try { ins.pickup_date = new Date(trackingData.pickupDate).toISOString().split('T')[0] } catch {}
    if (trackingData?.deliveryDate) try { ins.delivery_date = new Date(trackingData.deliveryDate).toISOString().split('T')[0] } catch {}
    const { error } = await supabase.from('ratings').insert(ins)
    if (error) {
      console.error(error)
      setRatingSubmitting(false)
      if (error.code === '23505') {
        setRatingError('Bu takip numarası zaten değerlendirilmiş — puanın önceden kaydedilmiş.')
      } else {
        setRatingError('Kaydedilirken bir hata oluştu, tekrar dene.')
      }
      return
    }
    setSubmitted(true)
    await loadScores()
    await loadMyParcels()
    setTimeout(() => { setSubmitted(false); setRatingSubmitting(false); resetAndGoBack() }, 1800)
  }

  function resetAndGoBack() {
    setRating(0); setTrackingNo(''); setSelectedCarrierId(null); setSelectedCarrierInfo(null)
    setTrackingData(null); setTrackingError(''); setSourceNote(''); setAddSelectedCarrierId(null)
    setFlow(null); setTab('list')
  }

  async function loadMyParcels() {
    if (!user) return
    setMyParcelsLoading(true)
    const { data, error } = await supabase
      .from('ratings')
      .select('*, carrier:carriers(name, logo_url, logo_emoji)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) setMyParcels(data)
    setMyParcelsLoading(false)
  }

  function openDetail(parcel) {
    setDetailParcel(parcel); setKebabOpen(false); setDeleteConfirm(false); setFlow('detail')
  }

  async function handleDeleteParcel(id) {
    const { error } = await supabase.from('ratings').delete().eq('id', id).eq('user_id', user.id)
    if (!error) {
      setMyParcels(prev => prev.filter(p => p.id !== id))
      setFlow(null); setDetailParcel(null); setDeleteConfirm(false)
      await loadScores()
    }
  }

  if (loading) return (<div className="container" style={{ paddingTop: 100, textAlign: 'center' }}><div style={{ fontSize: 44 }}>📦</div><p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Yükleniyor...</p></div>)

  // ═══════════════════════════ LANDING ═══════════════════════════
  if (screen === 'landing') return (
    <div className="container">
      <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 40 }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>📦</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: -0.5, color: 'var(--brand)' }}>KargoSkor</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>Kargonu puanla, herkesin işini kolaylaştır.</p>
      </div>
      <div className="card">
        {loginMode !== 'forgot' && (
          <div style={{ display: 'flex', marginBottom: 24, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
            {['register', 'login'].map(mode => (
              <button key={mode} onClick={() => { setLoginMode(mode); setAuthError(''); setForgotSent(false) }}
                style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                  background: loginMode === mode ? '#FFFFFF' : 'transparent', color: loginMode === mode ? 'var(--brand)' : 'var(--text-muted)',
                  boxShadow: loginMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {mode === 'register' ? 'Kayıt Ol' : 'Giriş Yap'}
              </button>))}
          </div>
        )}

        {loginMode === 'forgot' ? (
          forgotSent ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📧</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>E-postanı kontrol et</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{forgotEmail} adresine bir şifre sıfırlama linki gönderdik. Linke tıklayınca yeni şifreni belirleyebileceksin.</p>
              <button className="btn-secondary" onClick={() => { setLoginMode('login'); setForgotSent(false); setAuthError('') }}>Giriş ekranına dön</button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Şifreni sıfırla</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Kayıtlı e-posta adresini gir, sana bir sıfırlama linki gönderelim.</p>
              <div style={{ marginBottom: 14 }}><label className="label">E-posta</label><input className="input" type="email" placeholder="ornek@mail.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} autoFocus /></div>
              {authError && <p className="error-text" style={{ marginBottom: 14 }}>{authError}</p>}
              <button className="btn-primary" type="submit" disabled={forgotSubmitting}>{forgotSubmitting ? 'Gönderiliyor...' : 'Sıfırlama Linki Gönder'}</button>
              <button type="button" onClick={() => { setLoginMode('login'); setAuthError('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: 0, marginTop: 14, fontFamily: 'inherit', display: 'block', width: '100%', textAlign: 'center' }}>← Giriş ekranına dön</button>
            </form>
          )
        ) : (
          <>
            <form onSubmit={loginMode === 'register' ? handleRegister : handleLogin}>
              {loginMode === 'register' && <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}><label className="label">Ad</label><input className="input" placeholder="Adınız" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
                <div style={{ flex: 1 }}><label className="label">Soyad</label><input className="input" placeholder="Soyadınız" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
              </div>}
              <div style={{ marginBottom: 14 }}><label className="label">E-posta</label><input className="input" type="email" placeholder="ornek@mail.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div style={{ marginBottom: 14 }}>
                <label className="label">Şifre</label>
                <input className="input" type="password" placeholder="En az 6 karakter" value={password} onChange={e => setPassword(e.target.value)} />
                {loginMode === 'login' && (
                  <button type="button" onClick={() => { setLoginMode('forgot'); setForgotEmail(email); setAuthError('') }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 8, fontFamily: 'inherit', fontWeight: 600 }}>
                    Şifremi unuttum?
                  </button>
                )}
              </div>
              {authError && <p className="error-text" style={{ marginBottom: 14 }}>{authError}</p>}
              <button className="btn-primary" type="submit">{loginMode === 'register' ? 'Kayıt Ol' : 'Giriş Yap'}</button>
            </form>
            <div className="divider"><span>veya</span></div>
            <button className="btn-secondary" onClick={handleGoogleLogin}><span style={{ fontSize: 18, fontWeight: 700 }}>G</span> Google ile devam et</button>
          </>
        )}
      </div>
      {scores.length > 0 && <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}><span style={{ fontSize: 20 }}>🏆</span><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kargo Skorları</h3></div>
        <ScoreList scores={scores} />
      </div>}
      <p className="footer">Kayıt olarak Kullanım Koşulları ve Gizlilik Politikası'nı kabul etmiş olursunuz.</p>
    </div>
  )

  // ═══════════════════════════ ŞİFRE SIFIRLAMA (mail linkinden geldiğinde) ═══════════════════════════
  if (screen === 'reset_password') return (
    <div className="container">
      <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 32 }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🔑</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--brand)' }}>Yeni Şifre Belirle</h1>
      </div>
      <div className="card">
        {resetSuccess ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Şifren güncellendi!</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uygulamaya yönlendiriliyorsun...</p>
          </div>
        ) : (
          <form onSubmit={handleSetNewPassword}>
            <div style={{ marginBottom: 14 }}><label className="label">Yeni Şifre</label><input className="input" type="password" placeholder="En az 6 karakter" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus /></div>
            <div style={{ marginBottom: 14 }}><label className="label">Yeni Şifre (tekrar)</label><input className="input" type="password" placeholder="Şifreni tekrar gir" value={newPassword2} onChange={e => setNewPassword2(e.target.value)} /></div>
            {resetError && <p className="error-text" style={{ marginBottom: 14 }}>{resetError}</p>}
            <button className="btn-primary" type="submit" disabled={resetSubmitting}>{resetSubmitting ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}</button>
          </form>
        )}
      </div>
    </div>
  )

  // ═══════════════════════════ APP SHELL (tabs + flow overlays) ═══════════════════════════
  if (screen === 'app') {

    // ── FLOW: Kargo Ekle (tek ekran) ──
    if (flow === 'add') return (
      <div className="container">
        <button onClick={() => setFlow(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}>← Geri dön</button>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)', marginBottom: 4 }}>📦 Kargo Ekle</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Kargo firmasını ve teslimat bilgilerini otomatik olarak bulacağız.</p>

        <form onSubmit={handleTrackingSubmit}>
          <div className="card" style={{ marginBottom: 14 }}>
            <label className="label">Takip Numarası *</label>
            <input className="input" placeholder="Takip numaranızı girin" value={trackingNo} onChange={e => { setTrackingNo(e.target.value); setTrackingError('') }} autoFocus />
            {trackingError && <p className="error-text">{trackingError}</p>}
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}>Kargo takip numaranızı kargo firmasının SMS veya e-posta bildiriminden bulabilirsiniz.</p>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <label className="label">Kargo Firması (opsiyonel)</label>
            <input className="input" placeholder="Otomatik algılansın, ya da ara..." value={carrierSearch}
              onChange={e => { setCarrierSearch(e.target.value); setAddSelectedCarrierId(null) }} />
            {carrierSearch.trim() && (
              <div className="carrier-pick-list">
                {carriers.filter(c => c.name.toLowerCase().includes(carrierSearch.toLowerCase())).map(c => (
                  <div key={c.id} className={`carrier-pick-item${addSelectedCarrierId === c.id ? ' selected' : ''}`}
                    onClick={() => { setAddSelectedCarrierId(c.id); setCarrierSearch(c.name) }}>
                    {c.logo_url
                      ? <img src={c.logo_url} alt={c.name} className="carrier-logo" style={{ width: 22, height: 22 }} onError={e => { e.target.style.display = 'none' }} />
                      : <span style={{ fontSize: 16 }}>{c.logo_emoji}</span>}
                    {c.name}
                  </div>
                ))}
                {carriers.filter(c => c.name.toLowerCase().includes(carrierSearch.toLowerCase())).length === 0 &&
                  <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>Firma bulunamadı, otomatik algılamayı deneyeceğiz.</div>}
              </div>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}>Boş bırakırsan takip numarasından otomatik tespit etmeye çalışırız; bulamazsak firmayı sana sorarız.</p>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <label className="label">Kargo Adı (opsiyonel)</label>
            <input className="input" placeholder="Örn: Trendyol siparişi" value={sourceNote} onChange={e => setSourceNote(e.target.value)} />
          </div>

          <button className="btn-primary" type="submit" disabled={trackingLoading || !trackingNo.trim()}>
            {trackingLoading ? 'Aranıyor...' : 'Devam Et →'}
          </button>
        </form>
      </div>
    )

    // ── FLOW: Kargo firması seçimi (fallback) ──
    if (flow === 'select_carrier') return (
      <div className="container">
        <button onClick={() => setFlow('add')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}>← Geri dön</button>
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'monospace' }}>{trackingNo}</p>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px' }}>Kargo firmasını otomatik bulamadık</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Bu gönderiyi hangi firma taşıdı?</p>
        </div>
        {debugApi && (
          <div style={{ background: '#FFF8E1', border: '1px dashed #D9B84A', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: '#6B5900', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            <strong>DEBUG (geçici):</strong> verified={String(debugApi.verified)} · courierCode={JSON.stringify(debugApi.courierCode)} · courierName={JSON.stringify(debugApi.courierName)} · error={JSON.stringify(debugApi.error)}
            {debugApi.debug && <div style={{ marginTop: 6 }}>debug={JSON.stringify(debugApi.debug)}</div>}
          </div>
        )}
        {trackingLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Seçtiğin firmayla kargo hareketleri aranıyor, birkaç saniye sürebilir...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {carriers.map(c => (
              <button key={c.id} onClick={() => handleCarrierSelect(c)} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', width: '100%', fontSize: 15, fontWeight: 600,
                fontFamily: 'inherit', color: 'var(--text-primary)', transition: 'border-color 0.2s' }}>
                {c.logo_url
                  ? <img src={c.logo_url} alt={c.name} className="carrier-logo" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }} />
                  : null}
                <span style={{ fontSize: 22, display: c.logo_url ? 'none' : 'inline' }}>{c.logo_emoji}</span>
                <span>{c.name}</span>
              </button>))}
          </div>
        )}
      </div>
    )

    // ── FLOW: Puanlama ──
    if (flow === 'rate') {
      if (submitted) return (
        <div className="container" style={{ textAlign: 'center', paddingTop: 120 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Puanın Kaydedildi!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Değerlendirmen için teşekkürler.</p>
        </div>
      )

      const has = trackingData && (trackingData.originCity || trackingData.destinationCity || trackingData.deliveryDays)

      return (
        <div className="container">
          <button onClick={() => { setFlow('select_carrier'); setRating(0) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}>← Geri dön</button>

          <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px 24px' }}>
            {selectedCarrierInfo?.logo_url
              ? <img src={selectedCarrierInfo.logo_url} alt={selectedCarrierInfo.name} className="carrier-logo-lg" style={{ margin: '0 auto' }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }} />
              : null}
            <span style={{ fontSize: 36, display: selectedCarrierInfo?.logo_url ? 'none' : 'inline' }}>{selectedCarrierInfo?.logo_emoji}</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px', color: 'var(--brand)' }}>{selectedCarrierInfo?.name}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{trackingNo}</p>
            {trackingData?.status && (
              <div style={{ display: 'inline-block', marginTop: 10, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: trackingData.status === 'delivered' ? '#E7F5EC' : '#FFF6E0',
                color: trackingData.status === 'delivered' ? 'var(--green)' : 'var(--yellow)' }}>
                {trackingData.status === 'delivered' ? '✓ Teslim Edildi' : trackingData.status === 'intransit' ? '🚚 Yolda' : trackingData.status === 'outfordelivery' ? '📬 Dağıtımda' : '📦 ' + trackingData.status}
              </div>
            )}
          </div>

          {has && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>📊 Performans Özeti</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>Çıkış</p>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{trackingData.originCity || '—'}</p>
                  {trackingData.pickupDate && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{formatDate(trackingData.pickupDate)}</p>}
                </div>
                <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  {trackingData.deliveryDays && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{trackingData.deliveryDays} gün</span>}
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, #F59E0B, #10B981)' }} />
                    <span style={{ fontSize: 14 }}>📦</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>Varış</p>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{trackingData.destinationCity || '—'}</p>
                  {trackingData.deliveryDate && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{formatDate(trackingData.deliveryDate)}</p>}
                </div>
              </div>
              {trackingData.deliveryDays && (
                <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>Teslim Süresi</p>
                  <p style={{ fontSize: 28, fontWeight: 800, margin: 0,
                    color: trackingData.deliveryDays <= 1 ? 'var(--green)' : trackingData.deliveryDays <= 3 ? 'var(--yellow)' : 'var(--red)' }}>
                    {trackingData.deliveryDays} gün</p>
                </div>
              )}
            </div>
          )}

          {sourceNote && (
            <div style={{ display: 'inline-block', background: 'var(--bg-input)', borderRadius: 20, padding: '4px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 600 }}>
              🏷️ {sourceNote}
            </div>
          )}

          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Bu teslimata kaç puan veriyorsun?</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px' }}>Deneyimini 1-5 arası değerlendir</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><StarRating rating={rating} onRate={setRating} size={40} /></div>
            {rating > 0 && <p style={{ fontSize: 14, color: 'var(--brand)', margin: '8px 0 0', fontWeight: 600 }}>
              {['', 'Çok kötü 😤', 'Kötü 😕', 'İdare eder 😐', 'İyi 🙂', 'Mükemmel 🤩'][rating]}</p>}
            {ratingError && <p className="error-text" style={{ marginTop: 12 }}>{ratingError}</p>}
            <button className="btn-primary" onClick={handleRatingSubmit} disabled={rating === 0 || ratingSubmitting} style={{ marginTop: 20 }}>
              {ratingSubmitting ? 'Gönderiliyor...' : 'Puanı Gönder'}
            </button>
          </div>
        </div>
      )
    }

    // ── FLOW: Kargo detayı ──
    if (flow === 'detail' && detailParcel) {
      const p = detailParcel
      const tier = deliveryTier(p)
      return (
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button onClick={() => { setFlow(null); setDetailParcel(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>← Geri dön</button>
            <div className="kebab-wrap">
              <button className="kebab-btn" onClick={() => setKebabOpen(o => !o)}>⋮</button>
              {kebabOpen && (
                <div className="kebab-menu">
                  {!deleteConfirm
                    ? <button className="danger" onClick={() => setDeleteConfirm(true)}>🗑 Sil</button>
                    : <button className="danger" onClick={() => handleDeleteParcel(p.id)}>Emin misin? Sil</button>}
                </div>
              )}
            </div>
          </div>

          {/* Hero */}
          <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px 24px' }}>
            {p.carrier?.logo_url
              ? <img src={p.carrier.logo_url} alt={p.carrier.name} className="carrier-logo-lg" style={{ margin: '0 auto' }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }} />
              : null}
            <span style={{ fontSize: 36, display: p.carrier?.logo_url ? 'none' : 'inline' }}>{p.carrier?.logo_emoji}</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px', color: 'var(--brand)' }}>{p.carrier?.name || 'Bilinmeyen firma'}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{p.tracking_number}</p>
            <div className={`status-pill ${tier.cls}`} style={{ marginTop: 12 }}><span className="dot" />{tier.label}</div>
            {p.source_note && (
              <div style={{ display: 'inline-block', background: 'var(--bg-input)', borderRadius: 20, padding: '3px 12px', fontSize: 11, color: 'var(--text-secondary)', marginTop: 10, fontWeight: 600 }}>
                🏷️ {p.source_note}
              </div>
            )}
          </div>

          {/* Performans / ilerleme */}
          {(p.origin_city || p.destination_city || p.delivery_days != null) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>📊 Teslimat Özeti</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>Çıkış</p>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{p.origin_city || '—'}</p>
                  {p.pickup_date && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{formatDate(p.pickup_date)}</p>}
                </div>
                <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  {p.delivery_days != null && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.delivery_days} gün</span>}
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'linear-gradient(90deg, #F59E0B, #10B981)' }} />
                    <span style={{ fontSize: 14 }}>📦</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>Varış</p>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{p.destination_city || '—'}</p>
                  {p.delivery_date && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{formatDate(p.delivery_date)}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Zaman çizelgesi */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 18px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>🕒 Kargo Hareketleri</h3>
            <div className="timeline">
              <div className="timeline-item">
                <div className="rail"><div className="node" /><div className="line done" /></div>
                <div className="content">
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Kargo Alındı</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{p.origin_city ? `${p.origin_city} · ` : ''}{formatDate(p.pickup_date) || 'Tarih bilinmiyor'}</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="rail"><div className="node" /><div className="line done" /></div>
                <div className="content">
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Yolda</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Dağıtım merkezleri arasında taşındı</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="rail"><div className="node" /></div>
                <div className="content">
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Teslim Edildi</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{p.destination_city ? `${p.destination_city} · ` : ''}{formatDate(p.delivery_date) || 'Tarih bilinmiyor'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Senin puanın */}
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Senin Puanın</h3>
            <div style={{ display: 'flex', justifyContent: 'center' }}><StarRating rating={p.score} interactive={false} size={30} /></div>
          </div>
        </div>
      )
    }

    // ── TAB CONTENT (list / scores / profile) with bottom tab bar ──
    return (
      <div className="container with-tabbar" style={{ position: 'relative' }}>

        {tab === 'list' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Hoş geldin,</p>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 0', color: 'var(--brand)' }}>{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Kullanıcı'}</h2>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📦 Kargolarım</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{myParcelsLoading ? 'Yükleniyor...' : `${myParcels.length} kargo`}</span>
            </div>

            {!myParcelsLoading && myParcels.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Henüz kargo eklemedin.</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>Sağ alttaki + butonuna dokunarak takip numaranı ekle.</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myParcels.map(p => {
                const tier = deliveryTier(p)
                return (
                  <button key={p.id} className="parcel-card" onClick={() => openDetail(p)}>
                    {p.carrier?.logo_url
                      ? <img src={p.carrier.logo_url} alt={p.carrier.name} className="carrier-logo" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }} />
                      : null}
                    <span style={{ fontSize: 20, display: p.carrier?.logo_url ? 'none' : 'inline' }}>{p.carrier?.logo_emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{p.carrier?.name || 'Bilinmeyen firma'}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 4px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.tracking_number || '—'}{p.source_note ? ` · ${p.source_note}` : ''}</p>
                      <div className={`status-pill ${tier.cls}`}><span className="dot" />{tier.label}</div>
                    </div>
                    <span className="chevron">›</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {tab === 'scores' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)', marginBottom: 18 }}>🏆 Kargo Skorları</h2>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Genel Sıralama</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{scores.reduce((a, s) => a + Number(s.total_ratings), 0).toLocaleString('tr-TR')} değerlendirme</span>
              </div>
              <ScoreList scores={scores} />
            </div>
          </>
        )}

        {tab === 'profile' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)', marginBottom: 18 }}>👤 Profil</h2>
            <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--brand)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, margin: '0 auto 12px' }}>
                {(user?.user_metadata?.full_name || user?.email || '?').charAt(0).toUpperCase()}
              </div>
              <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{user?.user_metadata?.full_name || user?.email?.split('@')[0]}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{user?.email}</p>
            </div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Toplam kargo</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{myParcels.length}</span>
              </div>
            </div>
            <button className="btn-secondary" onClick={handleLogout}>Çıkış Yap</button>
            <p className="footer">KargoSkor © 2026 — Tüm hakları saklıdır.</p>
          </>
        )}

        {/* Yüzen ekle butonu (sadece kargolarım sekmesinde) */}
        {tab === 'list' && <button className="fab" onClick={openAddFlow} aria-label="Kargo Ekle">+</button>}

        {/* Alt tab bar */}
        <div className="tabbar">
          <button className={`tabbar-item${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>
            <span className="tabbar-icon">📦</span><span className="tabbar-label">Kargolarım</span>
          </button>
          <button className={`tabbar-item${tab === 'scores' ? ' active' : ''}`} onClick={() => setTab('scores')}>
            <span className="tabbar-icon">🏆</span><span className="tabbar-label">Skorlar</span>
          </button>
          <button className={`tabbar-item${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')}>
            <span className="tabbar-icon">👤</span><span className="tabbar-label">Profil</span>
          </button>
        </div>
      </div>
    )
  }

  return null
}

function ScoreList({ scores }) {
  if (!scores || scores.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>Henüz değerlendirme yok.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {scores.map((s, i) => (
        <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', width: 18, textAlign: 'right' }}>{i + 1}.</span>
          {s.logo_url
            ? <img src={s.logo_url} alt={s.name} className="carrier-logo" style={{ width: 24, height: 24 }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }} />
            : null}
          <span style={{ fontSize: 16, width: 24, display: s.logo_url ? 'none' : 'inline' }}>{s.logo_emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Number(s.avg_delivery_days) > 0 ? `ø ${s.avg_delivery_days} gün · ` : ''}{Number(s.total_ratings).toLocaleString('tr-TR')} oy</span>
            </div>
            <ScoreBar score={Number(s.avg_score)} />
          </div>
        </div>
      ))}
    </div>
  )
}
