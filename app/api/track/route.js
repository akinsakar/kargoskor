import { NextResponse } from 'next/server'

const BASE = 'https://api.aftership.com/tracking/2024-04/trackings'

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchTracking(trackingNumber, apiKey) {
  const res = await fetch(`${BASE}?tracking_numbers=${encodeURIComponent(trackingNumber)}`, {
    headers: { 'as-api-key': apiKey },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) return { obj: null, status: res.status, error: data?.meta?.message || data?.meta?.code || `GET ${res.status}` }
  const trackings = data?.data?.trackings || []
  return { obj: trackings.length > 0 ? trackings[0] : null, status: res.status, error: null }
}

export async function POST(request) {
  try {
    const { trackingNumber } = await request.json()

    if (!trackingNumber) {
      return NextResponse.json({ error: 'Takip numarası gerekli', verified: false }, { status: 200 })
    }

    const apiKey = process.env.AFTERSHIP_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API yapılandırması eksik', verified: false }, { status: 200 })
    }

    const num = trackingNumber.trim()
    const debugInfo = {}

    // 1) Var olan takibi kontrol et
    let getResult = await fetchTracking(num, apiKey)
    let trackingObj = getResult.obj
    debugInfo.getStatus = getResult.status
    debugInfo.getError = getResult.error

    // 2) Yoksa oluştur (AfterShip otomatik kurye tespiti yapar)
    if (!trackingObj) {
      const createRes = await fetch(BASE, {
        method: 'POST',
        headers: { 'as-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking: { tracking_number: num } }),
      })
      const createData = await createRes.json().catch(() => null)
      debugInfo.createStatus = createRes.status
      debugInfo.createError = createData?.meta?.message || createData?.meta?.code || null

      if (createRes.ok) {
        trackingObj = createData?.data?.tracking || null
      } else {
        // Oluşturma başarısız oldu — muhtemelen bu numara zaten hesapta kayıtlı
        // (örn. daha önce panelden elle eklenmiş). Tekrar GET ile aramayı dene.
        const retry = await fetchTracking(num, apiKey)
        trackingObj = retry.obj
        debugInfo.retryGetStatus = retry.status
        debugInfo.retryGetError = retry.error
      }
    }

    if (!trackingObj) {
      return NextResponse.json({
        verified: false,
        error: debugInfo.createError || debugInfo.getError || 'Takip oluşturulamadı',
        debug: debugInfo,
      }, { status: 200 })
    }

    // 3) Checkpoint verisi gelene kadar birkaç kez dene (AfterShip async çalışıyor)
    let checkpoints = trackingObj.checkpoints || []
    for (let i = 0; i < 4 && checkpoints.length === 0; i++) {
      await wait(2500)
      const refreshed = await fetchTracking(num, apiKey)
      if (refreshed.obj) {
        trackingObj = refreshed.obj
        checkpoints = refreshed.obj.checkpoints || []
      }
    }

    if (checkpoints.length === 0) {
      // Veri henüz gelmedi — kullanıcı manuel akışa düşecek
      return NextResponse.json({
        verified: false,
        courierCode: trackingObj.slug || null,
        courierName: trackingObj.courier_name || null,
        debug: debugInfo,
      }, { status: 200 })
    }

    // Checkpoint'leri zamana göre eskiden yeniye sırala
    const sorted = [...checkpoints].sort((a, b) => {
      const ta = new Date(a.checkpoint_time || a.created_at || 0).getTime()
      const tb = new Date(b.checkpoint_time || b.created_at || 0).getTime()
      return ta - tb
    })

    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    const tag = (trackingObj.tag || '').toLowerCase()
    const statusMap = {
      delivered: 'delivered',
      intransit: 'intransit',
      outfordelivery: 'outfordelivery',
      pending: 'pending',
      infomationreceived: 'pending',
      exception: 'exception',
    }

    const result = {
      verified: true,
      eventCount: sorted.length,
      courierCode: trackingObj.slug || null,
      courierName: trackingObj.courier_name || null,
      status: statusMap[tag] || tag || 'unknown',
      originCity: first?.city || first?.location || first?.country_name || null,
      destinationCity: last?.city || last?.location || last?.country_name || null,
      pickupDate: first?.checkpoint_time || first?.created_at || null,
      deliveryDate: tag === 'delivered' ? (last?.checkpoint_time || last?.created_at) : null,
      deliveryDays: null,
    }

    if (result.pickupDate && result.deliveryDate) {
      const diffMs = new Date(result.deliveryDate) - new Date(result.pickupDate)
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      result.deliveryDays = days > 0 ? days : 1
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Track API error:', error)
    return NextResponse.json({ error: 'Sunucu hatası', verified: false }, { status: 200 })
  }
}
