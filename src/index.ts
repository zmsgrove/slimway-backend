import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'

import { requireAuth } from './middleware/auth.middleware'
import { resolveBranch } from './middleware/branch.middleware'

import clientsRouter from './routes/clients.routes'
import membershipsRouter from './routes/memberships.routes'
import scheduleRouter from './routes/schedule.routes'
import bookingsRouter from './routes/bookings.routes'
import branchesRouter from './routes/branches.routes'
import devicesRouter from './routes/devices.routes'
import subscriptionsRouter from './routes/subscriptions.routes'
import scheduleSlotsRouter from './routes/schedule-slots.routes'
import bookingsV2Router from './routes/bookings-v2.routes'
import subscriptionTemplatesRouter from './routes/subscription-templates.routes'
import employeesRouter from './routes/employees.routes'
import shiftsRouter from './routes/shifts.routes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Базовые middleware
app.use(helmet())
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://slimway.com.kz'
  ],
  credentials: true
}))
app.use(morgan('dev'))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' })
})

// Tilda CRM proxy
app.post('/api/tilda-proxy', async (req, res) => {
  try {
    const body = req.body;
    const fd = new URLSearchParams();
    Object.keys(body).forEach(key => fd.append(key, body[key]));
    fd.append('formid', '2317076783');
    fd.append('formservices[]', '76565d0fb10b1315f77b7c477956d95e');
    fd.append('form-spec-comments', 'Its good');
    fd.append('tildaspec-phone-part[]-iso', 'KZ');
    fd.append('tildaspec-phone-part[]', body.Phone || '');

    const response = await fetch('https://forms.tildaapi.pro/procces/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fd.toString()
    });
    const data = await response.text();
    console.log('Tilda response:', data);
    return res.json({ ok: true, data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});


// Wazzup proxy — публичный роут (без авторизации)
app.post('/api/wazzup-proxy', async (req, res) => {
  try {
    const { phone, message } = req.body
    console.log('Wazzup request - phone:', phone)
    
    const channelsRes = await fetch('https://api.wazzup24.com/v3/channels', {
      headers: { 'Authorization': `Bearer ${process.env.WAZZUP_API_KEY}` }
    })
    const channelsData = await channelsRes.json() as any[]
    console.log('Channels:', JSON.stringify(channelsData))
    
    const channel = channelsData.find((c: any) =>
      c.transport === 'whatsapp' && c.state === 'active'
    )
    console.log('Selected channel:', JSON.stringify(channel))
    
    if (!channel) {
      return res.status(500).json({ error: 'No active WhatsApp channel' })
    }

    const msgRes = await fetch('https://api.wazzup24.com/v3/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WAZZUP_API_KEY}`
      },
      body: JSON.stringify({
        channelId: channel.channelId,
        chatType: 'whatsapp',
        chatId: phone,
        text: message
      })
    })
    const msgData = await msgRes.json()
    console.log('Wazzup response:', JSON.stringify(msgData))
    return res.json({ ok: true, data: msgData })
  } catch (e: any) {
    console.log('Wazzup error:', e.message)
    return res.status(500).json({ error: e.message })
  }
})

// Все API-роуты защищены авторизацией и резолвером филиала
app.use('/api/v1', requireAuth, resolveBranch)

app.use('/api/v1/clients', clientsRouter)
app.use('/api/v1/memberships', membershipsRouter)
app.use('/api/v1/schedule', scheduleRouter)
app.use('/api/v1/bookings', bookingsRouter)
app.use('/api/v1/branches', branchesRouter)
app.use('/api/v1/devices', devicesRouter)
app.use('/api/v1/subscriptions', subscriptionsRouter)
app.use('/api/v1/schedule-slots', scheduleSlotsRouter)
app.use('/api/v1/bookings-v2', bookingsV2Router)
app.use('/api/v1/subscription-templates', subscriptionTemplatesRouter)
app.use('/api/v1/employees', employeesRouter)
app.use('/api/v1/shifts', shiftsRouter)

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' })
})

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
  console.log(`Slimway backend running on port ${PORT}`)
})

export default app
