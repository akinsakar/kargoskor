import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { trackingNumber } = await request.json()

    if (!trackingNumber) {
      return NextResponse.json({ error: 'Takip numarası gerekli' }, { status: 400 })
    }

    const apiKey = process.env.SHIP24_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API yapılandırması eksik' }, { status: 500 })
    }

    // Ship24 API - create tracker AND get results (correct endpoint)
    const res = await fetch('https://api.ship24.com/public/v1/trackers/track', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingNumber: trackingNumber.trim(),
        destinationCountryCode: 'TR',
        courierCode: [],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Ship24 error:', res.status, errText)

      if (res.status === 402) {
        return NextResponse.json({
          error: 'API limit reached',
          verified: false
        }, { status: 200 })
      }

      return NextResponse.json({
        error: 'Takip sorgusu başarısız',
        verified: false
      }, { status: 200 })
    }

    const data = await res.json()

    // Extract tracking info from response
    const trackings = data?.data?.trackings || []
    const tracker = data?.data?.tracker

    if (trackings.length === 0) {
      return NextResponse.json({
        trackingNumber: trackingNumber,
        verified: false,
        error: 'Takip bilgisi bulunamadı'
      }, { status: 200 })
    }

    const tracking = trackings[0]
    const shipment = tracking?.shipment
    const events = tracking?.events || []

    // Find first and last events
    const firstEvent = events.length > 0 ? events[events.length - 1] : null
    const lastEvent = events.length > 0 ? events[0] : null

    const result = {
      trackingNumber: tracker?.trackingNumber || trackingNumber,
      verified: true,
      courierCode: shipment?.courierCode || tracker?.courierCode?.[0] || null,
      courierName: shipment?.courierName || null,
      status: shipment?.statusMilestone || 'unknown',
      originCity: firstEvent?.location || null,
      destinationCity: lastEvent?.location || null,
      pickupDate: firstEvent?.datetime || null,
      deliveryDate: shipment?.statusMilestone === 'delivered' ? lastEvent?.datetime : null,
      deliveryDays: null,
      eventCount: events.length,
    }

    // Calculate delivery days
    if (result.pickupDate && result.deliveryDate) {
      const start = new Date(result.pickupDate)
      const end = new Date(result.deliveryDate)
      result.deliveryDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Track API error:', error)
    return NextResponse.json({
      error: 'Sunucu hatası',
      verified: false
    }, { status: 200 })
  }
}
