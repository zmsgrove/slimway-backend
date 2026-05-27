import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireRole } from '../middleware/role.middleware'

const router = Router()

// GET /schedule-slots?date=YYYY-MM-DD
router.get('/', async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { date, device_id } = req.query

  let query = supabase
    .from('schedule_slots')
    .select('*, devices(id, type, number, device_group, status)')
    .order('time_start', { ascending: true })

  if (branch_id)  query = query.eq('branch_id', branch_id)
  if (date)       query = query.eq('date', date as string)
  if (device_id)  query = query.eq('device_id', device_id as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// POST /schedule-slots — создать ячейку
router.post('/', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { branch_id } = req.user!
  const { device_id, date, time_start, time_end, status } = req.body

  if (!device_id || !date || !time_start || !time_end) {
    return res.status(400).json({
      error: 'device_id, date, time_start, time_end required',
      code: 'VALIDATION_ERROR',
    })
  }

  const { data, error } = await supabase
    .from('schedule_slots')
    .insert({ branch_id, device_id, date, time_start, time_end, status: status ?? 'free' })
    .select('*, devices(id, type, number, device_group, status)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Slot already exists for this device/date/time', code: 'SLOT_EXISTS' })
    }
    return res.status(500).json({ error: error.message })
  }
  return res.status(201).json(data)
})

// PATCH /schedule-slots/:id — обновить статус ячейки (blocked/maintenance)
router.patch('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body

  const { data, error } = await supabase
    .from('schedule_slots')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// DELETE /schedule-slots/:id — удалить ячейку (только если free)
router.delete('/:id', requireRole('owner', 'franchisee', 'admin'), async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: slot } = await supabase
    .from('schedule_slots')
    .select('status')
    .eq('id', id)
    .single()

  if (slot && slot.status !== 'free') {
    return res.status(409).json({ error: 'Cannot delete a non-free slot', code: 'SLOT_NOT_FREE' })
  }

  const { error } = await supabase.from('schedule_slots').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
})

export default router
