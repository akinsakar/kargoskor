'use client'

import { useState, useEffect } from 'react'
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
            color: star <= (hover || rating) ? '#F59E0B' : '#374151',
            transform: star <= (hover || rating) ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.15s ease' }}>★</button>
      ))}
    </div>
  )
}

function ScoreBar({ score, max = 5 }) {
  const pct = (score / max) * 100
  const color = score >= 4 ? '#10B981' : score >= 3 ? '#F59E0B' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ flex: 1, height: 8, background: '#1E293B', borderRadius: 4, overflow: 'hidden' }}>
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

export default function Home() {
  const [screen, setScreen] = useState('landing')
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
  const [rating, setRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [carriers, setCarriers] = useState([])
  const [scores, setScores] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); setScreen('dashboard') }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setUser(session.user); setScreen('dashboard') }
      else { setUser(null); setScreen('landing') }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { loadScores(); loadCarriers() }, [])

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

  async function handleTrackingSubmit(e) {
    e.preventDefault()
    if (!trackingNo.trim()) return
    setTrackingError(''); setTrackingLoading(true); setTrackingData(null)
    try {
      const hash = await hashTrackingNumber(trackingNo)
      const { data: existing } = await supabase.from('ratings').select('id').eq('tracking_number_hash', hash).single()
      if (existing) { setTrackingError('Bu takip numarası daha önce değerlendirilmiş.'); setTrackingLoading(false); return }

      let apiData = null
      try {
        const res = await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackingNumber: trackingNo.trim() }) })
        const json = await res.json()
        if (json.verified && json.eventCount > 0) apiData = json
      } catch (apiErr) { console.error('API error:', apiErr) }

      setTrackingData(apiData)
      setScreen('select_carrier')
    } catch (err) { console.error(err); setTrackingError('Bir hata oluştu, tekrar deneyin.') }
    setTrackingLoading(false)
  }

  function handleCarrierSelect(carrier) {
    setSelectedCarrierId(carrier.id); setSelectedCarrierInfo(carrier); setScreen('rate')
  }

  async function handleRatingSubmit() {
    if (rating === 0 || !selectedCarrierId || !user) return
    const hash = await hashTrackingNumber(trackingNo)
    const ins = { user_id: user.id, carrier_id: selectedCarrierId, tracking_number_hash: hash, score: rating,
      origin_city: trackingData?.originCity || null, destination_city: trackingData?.destinationCity || null, delivery_days: trackingData?.deliveryDays || null }
    if (trackingData?.pickupDate) try { ins.pickup_date = new Date(trackingData.pickupDate).toISOString().split('T')[0] } catch {}
    if (trackingData?.deliveryDate) try { ins.delivery_date = new Date(trackingData.deliveryDate).toISOString().split('T')[0] } catch {}
    const { error } = await supabase.from('ratings').insert(ins)
    if (error) { console.error(error); if (error.code === '23505') { setTrackingError('Bu takip numarası daha önce değerlendirilmiş.'); resetAndGoBack() } return }
    setSubmitted(true); await loadScores()
    setTimeout(() => { setSubmitted(false); resetAndGoBack() }, 2000)
  }

  function resetAndGoBack() {
    setRating(0); setTrackingNo(''); setSelectedCarrierId(null); setSelectedCarrierInfo(null); setTrackingData(null); setTrackingError(''); setScreen('dashboard')
  }

  if (loading) return (<div className="container" style={{ paddingTop: 100, textAlign: 'center' }}><div style={{ fontSize: 44 }}>📦</div><p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Yükleniyor...</p></div>)

  // ═══ LANDING ═══
  if (screen === 'landing') return (
    <div className="container">
      <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 40 }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>📦</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: -1, background: 'linear-gradient(135deg, #F59E0B, #FBBF24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>KargoSkor</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>Kargonu puanla, herkesin işini kolaylaştır.</p>
      </div>
      <div className="card">
        <div style={{ display: 'flex', marginBottom: 24, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
          {['register', 'login'].map(mode => (
            <button key={mode} onClick={() => { setLoginMode(mode); setAuthError('') }}
              style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                background: loginMode === mode ? 'rgba(245,158,11,0.15)' : 'transparent', color: loginMode === mode ? 'var(--accent)' : 'var(--text-muted)' }}>
              {mode === 'register' ? 'Kayıt Ol' : 'Giriş Yap'}
            </button>))}
        </div>
        <form onSubmit={loginMode === 'register' ? handleRegister : handleLogin}>
          {loginMode === 'register' && <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}><label className="label">Ad</label><input className="input" placeholder="Adınız" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="label">Soyad</label><input className="input" placeholder="Soyadınız" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
          </div>}
          <div style={{ marginBottom: 14 }}><label className="label">E-posta</label><input className="input" type="email" placeholder="ornek@mail.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div style={{ marginBottom: 14 }}><label className="label">Şifre</label><input className="input" type="password" placeholder="En az 6 karakter" value={password} onChange={e => setPassword(e.target.value)} /></div>
          {authError && <p className="error-text" style={{ marginBottom: 14 }}>{authError}</p>}
          <button className="btn-primary" type="submit">{loginMode === 'register' ? 'Kayıt Ol' : 'Giriş Yap'}</button>
        </form>
        <div className="divider"><span>veya</span></div>
        <button className="btn-secondary" onClick={handleGoogleLogin}><span style={{ fontSize: 18, fontWeight: 700 }}>G</span> Google ile devam et</button>
      </div>
      {scores.length > 0 && <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}><span style={{ fontSize: 20 }}>🏆</span><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kargo Skorları</h3></div>
        <ScoreList scores={scores} />
      </div>}
      <p className="footer">Kayıt olarak Kullanım Koşulları ve Gizlilik Politikası'nı kabul etmiş olursunuz.</p>
    </div>
  )

  // ═══ DASHBOARD ═══
  if (screen === 'dashboard') return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div><p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Hoş geldin,</p>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 0' }}>{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Kullanıcı'}</h2></div>
        <button onClick={handleLogout} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Çıkış</button>
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}><span style={{ fontSize: 20 }}>📦</span><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kargonu Puanla</h3></div>
        <form onSubmit={handleTrackingSubmit}>
          <label className="label">Takip Numarası</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ flex: 1 }} placeholder="Takip numaranızı girin" value={trackingNo} onChange={e => { setTrackingNo(e.target.value); setTrackingError('') }} />
            <button className="btn-primary" type="submit" disabled={trackingLoading || !trackingNo.trim()} style={{ width: 'auto', padding: '13px 20px', fontSize: 18 }}>{trackingLoading ? '⏳' : '→'}</button>
          </div>
        </form>
        {trackingError && <p className="error-text">{trackingError}</p>}
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}>Kargo takip numaranızı kargo firmasının SMS veya e-posta bildiriminden bulabilirsiniz.</p>
      </div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 20 }}>🏆</span><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kargo Skorları</h3></div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{scores.reduce((a, s) => a + Number(s.total_ratings), 0).toLocaleString('tr-TR')} değerlendirme</span>
        </div>
        <ScoreList scores={scores} />
      </div>
      <p className="footer">KargoSkor © 2026 — Tüm hakları saklıdır.</p>
    </div>
  )

  // ═══ CARRIER SELECTION ═══
  if (screen === 'select_carrier') return (
    <div className="container">
      <button onClick={resetAndGoBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}>← Geri dön</button>
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px' }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'monospace' }}>{trackingNo}</p>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px' }}>Kargo firmasını seçin</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Bu gönderiyi hangi firma taşıdı?</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {carriers.map(c => (
          <button key={c.id} onClick={() => handleCarrierSelect(c)} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', width: '100%', fontSize: 15, fontWeight: 600,
            fontFamily: 'inherit', color: 'var(--text-primary)', transition: 'border-color 0.2s',
            background: 'linear-gradient(145deg, #131C31, #0F172A)', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 16 }}>
            <span style={{ fontSize: 22 }}>{c.logo_emoji}</span><span>{c.name}</span>
          </button>))}
      </div>
    </div>
  )

  // ═══ RATE SCREEN ═══
  if (screen === 'rate') {
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
        <button onClick={() => { setScreen('select_carrier'); setRating(0) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}>← Geri dön</button>

        {/* Firma */}
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '28px 24px' }}>
          <span style={{ fontSize: 36 }}>{selectedCarrierInfo?.logo_emoji}</span>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px' }}>{selectedCarrierInfo?.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{trackingNo}</p>
          {trackingData?.status && (
            <div style={{ display: 'inline-block', marginTop: 10, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: trackingData.status === 'delivered' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
              color: trackingData.status === 'delivered' ? '#10B981' : '#F59E0B' }}>
              {trackingData.status === 'delivered' ? '✓ Teslim Edildi' : trackingData.status === 'intransit' ? '🚚 Yolda' : trackingData.status === 'outfordelivery' ? '📬 Dağıtımda' : '📦 ' + trackingData.status}
            </div>
          )}
        </div>

        {/* Performans Özeti */}
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
              <div style={{ background: '#0B1121', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>Teslim Süresi</p>
                <p style={{ fontSize: 28, fontWeight: 800, margin: 0,
                  color: trackingData.deliveryDays <= 1 ? '#10B981' : trackingData.deliveryDays <= 3 ? '#F59E0B' : '#EF4444' }}>
                  {trackingData.deliveryDays} gün</p>
              </div>
            )}
          </div>
        )}

        {/* Puanlama */}
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Bu teslimata kaç puan veriyorsun?</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px' }}>Deneyimini 1-5 arası değerlendir</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><StarRating rating={rating} onRate={setRating} size={40} /></div>
          {rating > 0 && <p style={{ fontSize: 14, color: 'var(--accent)', margin: '8px 0 0', fontWeight: 600 }}>
            {['', 'Çok kötü 😤', 'Kötü 😕', 'İdare eder 😐', 'İyi 🙂', 'Mükemmel 🤩'][rating]}</p>}
          <button className="btn-primary" onClick={handleRatingSubmit} disabled={rating === 0} style={{ marginTop: 20 }}>Puanı Gönder</button>
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
          <span style={{ fontSize: 16, width: 24 }}>{s.logo_emoji}</span>
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
