import { Router } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

const VALID_MODES   = ['light', 'dark'] as const
const VALID_ACCENTS = ['teal', 'purple', 'blue', 'green', 'orange', 'pink', 'gray'] as const

router.patch('/theme', async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { mode, accent } = req.body as { mode?: string; accent?: string }

  if (!mode || !VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
    return res.status(400).json({ error: 'Invalid mode', code: 'INVALID_MODE' })
  }
  if (!accent || !VALID_ACCENTS.includes(accent as typeof VALID_ACCENTS[number])) {
    return res.status(400).json({ error: 'Invalid accent', code: 'INVALID_ACCENT' })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ theme_preference: { mode, accent } })
    .eq('id', userId)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ ok: true, theme_preference: { mode, accent } })
})

export default router
