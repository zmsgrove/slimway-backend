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

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Базовые middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(morgan('dev'))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' })
})

// Все API-роуты защищены авторизацией и резолвером филиала
app.use('/api/v1', requireAuth, resolveBranch)

app.use('/api/v1/clients', clientsRouter)
app.use('/api/v1/memberships', membershipsRouter)
app.use('/api/v1/schedule', scheduleRouter)
app.use('/api/v1/bookings', bookingsRouter)
app.use('/api/v1/branches', branchesRouter)

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' })
})

app.listen(PORT, () => {
  console.log(`Slimway backend running on port ${PORT}`)
})

export default app
