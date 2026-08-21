import { NextResponse } from 'next/server'

const TURKISH_COURIERS = [
  'yurtici-kargo','aras-kargo','mng-kargo','ptt',
  'surat-kargo','trendyol-express','hepsijet','sendeo','kolay-gelsin',
]

const COURIER_NAME_MAP = {
  'yurtici-kargo':'Yurtiçi Kargo','aras-kargo':'Aras Kargo','mng-kargo':'MNG Kargo',
  'ptt':'PTT Kargo','surat-kargo':'Sürat Kargo','trendyol-express':'Trendyol Express',
  'hepsijet':'HepsiJet','sendeo':'Sendeo','kolay-gelsin':'Kolay Gelsin',
}

const CARRIER_SLUG_MAP = {
  'yurtici-kargo':'yurtici','aras-kargo':'aras','mng-kargo':'mng',
  'ptt':'ptt','surat-kargo':'surat','trendyol-express':'trendyol',
  'hepsijet':'hepsijet','sendeo':'sendeo','kolay-gelsin':'kolaygelsin',
}

export async function POST(request) {
  try {
    const { trackingNumber } = await request.json()
    if (!trackingNumber) {
      return NextResponse.json({ error: 'Takip numarası gerekli', verified: false })
    }

    const apiKey = process.env.SHIP24_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API yapılandırması eksik', verified: false })
    }

    const res = await fetch('https://api.ship24.com/public/v1/trackers/track', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingNumber: trackingNumber.trim(),
        destinationCountryCode: 'TR',
        originCountryCode: 'TR',
        courierCode: TURKISH_COURIERS,
      }),
    })

    if (!res.ok) {
      console.error('Ship24 error:', res.status)
      return NextResponse.json({ verified: false, error: 'Takip bilgisi bulunamadı.' })
    }

    const data = await res.json()
    const trackings = data?.data?.trackings || []
    const tracker = data?.data?.tracker

    if (trackings.length === 0 || !trackings[0]?.events?.length) {
      return NextResponse.json({
        trackingNumber, verified: false,
        error: 'Takip bilgisi bulunamadı. Kargonuz henüz sisteme girmemiş olabilir.'
      })
    }

    const tracking = trackings[0]
    const shipment = tracking?.shipment
    const events = tracking?.events || []
    const firstEvent = events[events.length - 1]
    const lastEvent = events[0]

    const courierCode = shipment?.courierCode || tracker?.courierCode?.[0] || null

    const result = {
      trackingNumber: tracker?.trackingNumber || trackingNumber,
      verified: true,
      carrierSlug: courierCode ? (CARRIER_SLUG_MAP[courierCode] || null) : null,
      carrierName: courierCode ? (COURIER_NAME_MAP[courierCode] || shipment?.courierName || courierCode) : null,
      courierCode,
      status: shipment?.statusMilestone || 'unknown',
      statusText: getStatusText(shipment?.statusMilestone),
      originCity: extractCity(firstEvent?.location),
      destinationCity: extractCity(lastEvent?.location),
      pickupDate: firstEvent?.datetime || null,
      deliveryDate: shipment?.statusMilestone === 'delivered' ? lastEvent?.datetime : null,
      deliveryDays: null,
      eventCount: events.length,
    }

    if (result.pickupDate && result.deliveryDate) {
      const start = new Date(result.pickupDate)
      const end = new Date(result.deliveryDate)
      result.deliveryDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)))
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Track API error:', error)
    return NextResponse.json({ verified: false, error: 'Sunucu hatası, tekrar deneyin.' })
  }
}

function getStatusText(milestone) {
  const map = {
    'pending':'Beklemede','info_received':'Bilgi Alındı','in_transit':'Yolda',
    'out_for_delivery':'Dağıtımda','failed_attempt':'Teslim Edilemedi',
    'delivered':'Teslim Edildi','exception':'Sorun Var','available_for_pickup':'Teslim Alınabilir',
  }
  return map[milestone] || 'Bilinmiyor'
}

function extractCity(location) {
  if (!location) return null
  return location.split(',')[0]?.trim() || location
}
