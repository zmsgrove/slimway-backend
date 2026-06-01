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
import leadsRouter from './routes/leads.routes'
import auditLogRouter from './routes/audit-log.routes'
import tasksRouter from './routes/tasks.routes'
import warehouseRouter from './routes/warehouse.routes'
import departmentsRouter from './routes/departments.routes'
import positionsRouter from './routes/positions.routes'
import analyticsRouter from './routes/analytics.routes'
import branchSubscriptionTemplatesRouter from './routes/branch-subscription-templates.routes'
import catalogRouter from './routes/catalog.routes'
import profileRouter from './routes/profile.routes'
import suppliersRouter from './routes/suppliers.routes'
import badgesRouter from './routes/badges.routes'
import permissionsRouter from './routes/permissions.routes'
import mfaRouter from './routes/mfa'
import promoCodesRouter from './routes/promo-codes.routes'
import supplierOrdersRouter from './routes/supplier-orders.routes'
import branchSettingsRouter from './routes/branch-settings.routes'
import clientRouter from './routes/client.routes'
import clientMessagesRouter from './routes/client-messages.routes'
import publicBookingRouter from './routes/public-booking.routes'
import bookingLinkRouter from './routes/booking-link.routes'
import automationRouter from './routes/automation.routes'
import timesheetRouter from './routes/timesheet.routes'
import { startSubscriptionCron } from './crons/subscriptions.cron'
import { startLeadsCron } from './crons/leads.cron'
import { startTasksCron } from './crons/tasks.cron'
import apiKeysRouter from './routes/api-keys.routes'
import saleRouter from './routes/sale.routes'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './config/swagger'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Базовые middleware
app.use(helmet())
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://slimway.com.kz',
    'https://slimway-frontend.onrender.com',
  ],
  credentials: true
}))
app.use(morgan('dev'))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' })
})

// Swagger UI — публичный, без авторизации
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Slimway CRM API',
  swaggerOptions: { persistAuthorization: true },
}))

// Tilda CRM proxy
app.post('/api/tilda-proxy', async (req, res) => {
  try {
    const body = req.body;
    const fd = new URLSearchParams();
    Object.keys(body).forEach(key => fd.append(key, body[key]));
    fd.append('formid', '2317076783');
    fd.append('formservices[]', '76565d0fb10b1315f77b7c477956d95e');
    fd.append('form-spec-comments', 'Its good');
var phoneClean = (body.Phone || '').replace(/[^0-9]/g, '');
fd.append('tildaspec-phone-part[0]-iso', 'KZ');
fd.append('tildaspec-phone-part[0]', phoneClean);
fd.set('Phone', phoneClean);
console.log('Tilda body:', fd.toString());
const response = await fetch('https://forms.tildaapi.pro/procces/', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://slimway.com.kz/analiz',
        'Origin': 'https://slimway.com.kz',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
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

// Profile routes — без resolveBranch (профиль не привязан к конкретному филиалу)
app.use('/api/v1/profile', requireAuth, profileRouter)

// MFA routes — без resolveBranch, без MFA-проверки (exempt в middleware)
app.use('/api/v1/auth/mfa', requireAuth, mfaRouter)

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
app.use('/api/v1/leads', leadsRouter)
app.use('/api/v1/audit-log', auditLogRouter)
app.use('/api/v1/tasks', tasksRouter)
app.use('/api/v1/warehouse', warehouseRouter)
app.use('/api/v1/departments', departmentsRouter)
app.use('/api/v1/positions', positionsRouter)
app.use('/api/v1/analytics', analyticsRouter)
app.use('/api/v1/branch-subscription-templates', branchSubscriptionTemplatesRouter)
app.use('/api/v1/catalog', catalogRouter)
app.use('/api/v1/suppliers', suppliersRouter)
app.use('/api/v1/badges', badgesRouter)
app.use('/api/v1/permissions', permissionsRouter)
app.use('/api/v1/promo-codes', promoCodesRouter)
app.use('/api/v1/supplier-orders', supplierOrdersRouter)
app.use('/api/v1/branch-settings', branchSettingsRouter)

// Client portal — public auth + protected routes (own middleware)
app.use('/api/client', clientRouter)

// Public booking page (no auth)
app.use('/api/public/booking', publicBookingRouter)

// CRM-side client messages (uses standard requireAuth + resolveBranch)
app.use('/api/v1/client-messages', clientMessagesRouter)

// Booking link management (uses standard auth)
app.use('/api/v1/booking-link', bookingLinkRouter)

// Automation module
app.use('/api/v1/automation', automationRouter)

// Timesheet
app.use('/api/v1/timesheet', timesheetRouter)

// API Keys
app.use('/api/v1/api-keys', apiKeysRouter)

// Sale (cart checkout)
app.use('/api/v1/sale', saleRouter)

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
  startSubscriptionCron()
  startLeadsCron()
  startTasksCron()
})

export default app
