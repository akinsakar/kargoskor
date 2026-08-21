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

    // Ship24 API - create a tracker
    const createRes = await fetch('https://api.ship24.com/public/v1/trackers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingNumber: trackingNumber,
      }),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      console.error('Ship24 create error:', errText)
      return NextResponse.json({ error: 'Takip sorgusu başarısız' }, { status: 400 })
    }

    const createData = await createRes.json()

    // Extract tracking info
    const tracker = createData?.data?.tracker
    const shipment = createData?.data?.shipment

    if (!tracker && !shipment) {
      return NextResponse.json({
        error: 'Takip bilgisi bulunamadı. Numara doğru mu?'
      }, { status: 404 })
    }

    // Parse events to find origin/destination and dates
    const events = shipment?.events || []
    const firstEvent = events.length > 0 ? events[events.length - 1] : null
    const lastEvent = events.length > 0 ? events[0] : null

    const result = {
      trackingNumber: tracker?.trackingNumber || trackingNumber,
      courierCode: tracker?.courierCode?.[0] || shipment?.courierCode || null,
      courierName: shipment?.courierName || tracker?.courierName || null,
      status: shipment?.statusMilestone || 'unknown',
      originCity: firstEvent?.location || null,
      destinationCity: lastEvent?.location || null,
      pickupDate: firstEvent?.datetime || null,
      deliveryDate: shipment?.statusMilestone === 'delivered' ? lastEvent?.datetime : null,
      events: events.slice(0, 10),
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
    return NextResponse.json({ error: 'Sunucu hatası oluştu' }, { status: 500 })
  }
}
