'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── Kargo firma eşleştirme ───
const CARRIER_MAP = {
  'yurtici-kargo': 'yurtici',
  'yurtici': 'yurtici',
  'aras-kargo': 'aras',
  'aras': 'aras',
  'mng-kargo': 'mng',
  'mng': 'mng',
  'ptt-kargo': 'ptt',
  'ptt': 'ptt',
  'surat-kargo': 'surat',
  'surat': 'surat',
  'trendyol-express': 'trendyol',
  'trendyol': 'trendyol',
  'hepsijet': 'hepsijet',
  'sendeo': 'sendeo',
  'kolay-gelsin': 'kolaygelsin',
  'kolaygelsin': 'kolaygelsin',
}

function detectCarrierFromNumber(num) {
  const t = num.trim().toUpperCase()
  if (/^YK/.test(t)) return 'yurtici'
  if (/^AR/.test(t)) return 'aras'
  if (/^MNG/.test(t)) return 'mng'
  if (/^(CP|RR|EP|LY)[0-9]{9}TR$/i.test(t)) return 'ptt'
  if (/^SR/.test(t)) return 'surat'
  if (/^(TY|TX)/.test(t)) return 'trendyol'
  if (/^HJ/.test(t)) return 'hepsijet'
  if (/^SND/.test(t)) return 'sendeo'
  return null
}

// ─── Yıldız puanlama bileşeni ───
function StarRating({ rating, onRate, size = 32, interactive = true }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={() => interactive && onRate?.(star)}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{
            background: 'none', border: 'none',
            cursor: interactive ? 'pointer' : 'default',
            fontSize: size, padding: 0, lineHeight: 1,
            color: star <= (hover || rating) ? '#F59E0B' : '#374151',
            transform: star <= (hover || rating) ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.15s ease',
          }}
        >★</button>
      ))}
    </div>
  )
}

// ─── Skor barı ───
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

// ─── Hash fonksiyonu (takip numarası gizliliği) ───
async function hashTrackingNumber(trackingNumber) {
  const encoder = new TextEncoder()
  const data = encoder.encode(trackingNumber.trim().toUpperCase())
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ═══════════════════════════════════════
// ANA BİLEŞEN
// ═══════════════════════════════════════
export default function Home() {
  const [screen, setScreen] = useState('landing')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Form states
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMode, setLoginMode] = useState('register')
  const [authError, setAuthError] = useState('')

  // Tracking states
  const [trackingNo, setTrackingNo] = useState('')
  const [trackingError, setTrackingError] = useState('')
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [shipment, setShipment] = useState(null)
  const [selectedCarrierId, setSelectedCarrierId] = useState(null)

  // Rating states
  const [rating, setRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  // Data
  const [carriers, setCarriers] = useState([])
  const [scores, setScores] = useState([])

  // ─── Oturum kontrolü ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('dashboard')
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('dashboard')
      } else {
        setUser(null)
        setScreen('landing')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ─── Skorları yükle ───
  useEffect(() => {
    loadScores()
    loadCarriers()
  }, [])

  async function loadScores() {
    const { data } = await supabase.from('carrier_scores').select('*')
    if (data) setScores(data)
  }

  async function loadCarriers() {
    const { data } = await supabase.from('carriers').select('*').eq('is_active', true)
    if (data) setCarriers(data)
  }

  // ─── Kayıt ───
  async function handleRegister(e) {
    e.preventDefault()
    setAuthError('')

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      setAuthError('Tüm alanları doldurun.')
      return
    }
    if (password.length < 6) {
      setAuthError('Şifre en az 6 karakter olmalı.')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    if (data.user) {
      // Profil oluştur
      await supabase.from('profiles').insert({
        id: data.user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
      })
    }
  }

  // ─── Giriş ───
  async function handleLogin(e) {
    e.preventDefault()
    setAuthError('')

    if (!email.trim() || !password.trim()) {
      setAuthError('E-posta ve şifre girin.')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    })

    if (error) {
      setAuthError('E-posta veya şifre hatalı.')
    }
  }

  // ─── Google ile giriş ───
  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) setAuthError(error.message)
  }

  // ─── Çıkış ───
  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // ─── Takip numarası sorgula ───
  async function handleTrackingSubmit(e) {
    e.preventDefault()
    if (!trackingNo.trim()) return

    setTrackingError('')
    setTrackingLoading(true)

    try {
      // Önce bu numara daha önce puanlanmış mı kontrol et
      const hash = await hashTrackingNumber(trackingNo)
      const { data: existing } = await supabase
        .from('ratings')
        .select('id')
        .eq('tracking_number_hash', hash)
        .single()

      if (existing) {
        setTrackingError('Bu takip numarası daha önce değerlendirilmiş.')
        setTrackingLoading(false)
        return
      }

      // Ship24 API ile sorgula
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: trackingNo.trim() }),
      })

      const trackData = await res.json()

      if (!res.ok) {
        // API başarısız olursa numara formatından firma tahmin et
        const guessedCarrier = detectCarrierFromNumber(trackingNo)
        if (guessedCarrier) {
          const carrier = carriers.find(c => c.slug === guessedCarrier)
          if (carrier) {
            setShipment({
              carrierSlug: guessedCarrier,
              carrierName: carrier.name,
              originCity: null,
              destinationCity: null,
              pickupDate: null,
              deliveryDate: null,
              deliveryDays: null,
              manualMode: true,
            })
            setSelectedCarrierId(carrier.id)
            setScreen('shipment')
            setTrackingLoading(false)
            return
          }
        }
        setTrackingError(trackData.error || 'Takip bilgisi bulunamadı.')
        setTrackingLoading(false)
        return
      }

      // Courier code ile firma eşleştir
      let carrierSlug = null
      if (trackData.courierCode) {
        const code = trackData.courierCode.toLowerCase()
        carrierSlug = CARRIER_MAP[code] || detectCarrierFromNumber(trackingNo)
      } else {
        carrierSlug = detectCarrierFromNumber(trackingNo)
      }

      const carrier = carriers.find(c => c.slug === carrierSlug)

      if (!carrier) {
        // Firma bulunamadıysa kullanıcıya seçtir
        setShipment({
          ...trackData,
          carrierSlug: null,
          manualCarrierSelect: true,
        })
        setScreen('shipment')
        setTrackingLoading(false)
        return
      }

      setSelectedCarrierId(carrier.id)
      setShipment({
        ...trackData,
        carrierSlug,
        carrierName: carrier.name,
      })
      setScreen('shipment')

    } catch (err) {
      console.error(err)
      setTrackingError('Bir hata oluştu, tekrar deneyin.')
    }

    setTrackingLoading(false)
  }

  // ─── Puanı kaydet ───
  async function handleRatingSubmit() {
    if (rating === 0 || !selectedCarrierId || !user) return

    const hash = await hashTrackingNumber(trackingNo)

    const { error } = await supabase.from('ratings').insert({
      user_id: user.id,
      carrier_id: selectedCarrierId,
      tracking_number_hash: hash,
      score: rating,
      origin_city: shipment?.originCity || null,
      destination_city: shipment?.destinationCity || null,
      pickup_date: shipment?.pickupDate ? new Date(shipment.pickupDate).toISOString().split('T')[0] : null,
      delivery_date: shipment?.deliveryDate ? new Date(shipment.deliveryDate).toISOString().split('T')[0] : null,
      delivery_days: shipment?.deliveryDays || null,
    })

    if (error) {
      console.error('Rating insert error:', error)
      if (error.code === '23505') {
        setTrackingError('Bu takip numarası daha önce değerlendirilmiş.')
      }
      return
    }

    setSubmitted(true)
    await loadScores()

    setTimeout(() => {
      setSubmitted(false)
      setRating(0)
      setTrackingNo('')
      setShipment(null)
      setSelectedCarrierId(null)
      setScreen('dashboard')
    }, 2000)
  }

  // ─── Yükleniyor ───
  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 100, textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>📦</div>
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Yükleniyor...</p>
      </div>
    )
  }

  // ═══ LANDING / AUTH ═══
  if (screen === 'landing') {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 40 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📦</div>
          <h1 style={{
            fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: -1,
            background: 'linear-gradient(135deg, #F59E0B, #FBBF24)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            KargoSkor
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>
            Kargonu puanla, herkesin işini kolaylaştır.
          </p>
        </div>

        <div className="card">
          {/* Tab */}
          <div style={{ display: 'flex', marginBottom: 24, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
            {['register', 'login'].map(mode => (
              <button
                key={mode}
                onClick={() => { setLoginMode(mode); setAuthError('') }}
                style={{
                  flex: 1, padding: '10px 0', border: 'none', borderRadius: 6,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  fontFamily: 'inherit',
                  background: loginMode === mode ? 'rgba(245,158,11,0.15)' : 'transparent',
                  color: loginMode === mode ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {mode === 'register' ? 'Kayıt Ol' : 'Giriş Yap'}
              </button>
            ))}
          </div>

          <form onSubmit={loginMode === 'register' ? handleRegister : handleLogin}>
            {loginMode === 'register' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Ad</label>
                  <input className="input" placeholder="Adınız" value={firstName}
                    onChange={e => setFirstName(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label">Soyad</label>
                  <input className="input" placeholder="Soyadınız" value={lastName}
                    onChange={e => setLastName(e.target.value)} />
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label className="label">E-posta</label>
              <input className="input" type="email" placeholder="ornek@mail.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="label">Şifre</label>
              <input className="input" type="password" placeholder="En az 6 karakter"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            {authError && <p className="error-text" style={{ marginBottom: 14 }}>{authError}</p>}

            <button className="btn-primary" type="submit">
              {loginMode === 'register' ? 'Kayıt Ol' : 'Giriş Yap'}
            </button>
          </form>

          <div className="divider"><span>veya</span></div>

          <button className="btn-secondary" onClick={handleGoogleLogin}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>G</span> Google ile devam et
          </button>
        </div>

        {/* Skor tablosu - giriş yapmadan da görülebilir */}
        {scores.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 20 }}>🏆</span>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kargo Skorları</h3>
            </div>
            <ScoreList scores={scores} />
          </div>
        )}

        <p className="footer">
          Kayıt olarak Kullanım Koşulları ve Gizlilik Politikası'nı kabul etmiş olursunuz.
        </p>
      </div>
    )
  }

  // ═══ DASHBOARD ═══
  if (screen === 'dashboard') {
    return (
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Hoş geldin,</p>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 0' }}>
              {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Kullanıcı'}
            </h2>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border-input)',
              borderRadius: 8, padding: '8px 14px', color: 'var(--text-secondary)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Çıkış
          </button>
        </div>

        {/* Takip numarası girişi */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>📦</span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kargonu Puanla</h3>
          </div>
          <form onSubmit={handleTrackingSubmit}>
            <label className="label">Takip Numarası</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Takip numaranızı girin"
                value={trackingNo}
                onChange={e => { setTrackingNo(e.target.value); setTrackingError('') }}
              />
              <button
                className="btn-primary"
                type="submit"
                disabled={trackingLoading || !trackingNo.trim()}
                style={{ width: 'auto', padding: '13px 20px', fontSize: 18 }}
              >
                {trackingLoading ? '...' : '→'}
              </button>
            </div>
          </form>
          {trackingError && <p className="error-text">{trackingError}</p>}
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}>
            Kargo takip numaranızı kargo firmasının SMS veya e-posta bildiriminden bulabilirsiniz.
          </p>
        </div>

        {/* Skor tablosu */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🏆</span>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Kargo Skorları</h3>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {scores.reduce((a, s) => a + Number(s.total_ratings), 0).toLocaleString('tr-TR')} değerlendirme
            </span>
          </div>
          <ScoreList scores={scores} />
        </div>

        <p className="footer">KargoSkor © 2026 — Tüm hakları saklıdır.</p>
      </div>
    )
  }

  // ═══ SHIPMENT + RATING ═══
  if (screen === 'shipment' && shipment) {
    if (submitted) {
      return (
        <div className="container" style={{ textAlign: 'center', paddingTop: 120 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Puanın Kaydedildi!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Değerlendirmen için teşekkürler.</p>
        </div>
      )
    }

    const carrierInfo = carriers.find(c => c.slug === shipment.carrierSlug)

    return (
      <div className="container">
        <button
          onClick={() => { setScreen('dashboard'); setShipment(null); setTrackingNo(''); setRating(0) }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20, fontFamily: 'inherit' }}
        >
          ← Geri dön
        </button>

        {/* Firma bilgisi */}
        {carrierInfo ? (
          <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: '32px 24px' }}>
            <span style={{ fontSize: 36 }}>{carrierInfo.logo_emoji}</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px' }}>{carrierInfo.name}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{trackingNo}</p>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Kargo firmasını seçin</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {carriers.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCarrierId(c.id); setShipment({ ...shipment, carrierSlug: c.slug, carrierName: c.name, manualCarrierSelect: false }) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                    background: selectedCarrierId === c.id ? 'rgba(245,158,11,0.1)' : 'var(--bg-input)',
                    border: `1px solid ${selectedCarrierId === c.id ? 'var(--accent)' : 'var(--border-input)'}`,
                    borderRadius: 10, cursor: 'pointer', color: 'var(--text-primary)',
                    fontSize: 14, fontFamily: 'inherit',
                  }}
                >
                  <span>{c.logo_emoji}</span> {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gönderi bilgileri (varsa) */}
        {(shipment.originCity || shipment.destinationCity || shipment.deliveryDays) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Gönderi Bilgileri
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              {shipment.originCity && (
                <div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Çıkış</p>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{shipment.originCity}</p>
                </div>
              )}
              {shipment.deliveryDays && (
                <div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Süre</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: shipment.deliveryDays <= 1 ? 'var(--green)' : shipment.deliveryDays <= 2 ? 'var(--yellow)' : 'var(--red)' }}>
                    {shipment.deliveryDays} gün
                  </p>
                </div>
              )}
              {shipment.destinationCity && (
                <div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Varış</p>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{shipment.destinationCity}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Puanlama */}
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Bu teslimata kaç puan veriyorsun?</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px' }}>Deneyimini 1-5 arası değerlendir</p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <StarRating rating={rating} onRate={setRating} size={40} />
          </div>

          {rating > 0 && (
            <p style={{ fontSize: 14, color: 'var(--accent)', margin: '8px 0 0', fontWeight: 600 }}>
              {['', 'Çok kötü 😤', 'Kötü 😕', 'İdare eder 😐', 'İyi 🙂', 'Mükemmel 🤩'][rating]}
            </p>
          )}

          <button
            className="btn-primary"
            onClick={handleRatingSubmit}
            disabled={rating === 0 || !selectedCarrierId}
            style={{ marginTop: 20 }}
          >
            Puanı Gönder
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ─── Skor listesi bileşeni ───
function ScoreList({ scores }) {
  if (!scores || scores.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>Henüz değerlendirme yok.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {scores.map((s, i) => (
        <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', width: 18, textAlign: 'right' }}>
            {i + 1}.
          </span>
          <span style={{ fontSize: 16, width: 24 }}>{s.logo_emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {Number(s.avg_delivery_days) > 0 ? `ø ${s.avg_delivery_days} gün · ` : ''}
                {Number(s.total_ratings).toLocaleString('tr-TR')} oy
              </span>
            </div>
            <ScoreBar score={Number(s.avg_score)} />
          </div>
        </div>
      ))}
    </div>
  )
}
