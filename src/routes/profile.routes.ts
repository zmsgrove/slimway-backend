import { Router } from 'express'
import { supabase } from '../config/supabase'

const router = Router()

const VALID_THEMES = [
  'black', 'dark', 'dark-blue', 'dark-green', 'dark-purple', 'coffee',
  'white', 'cream', 'light-blue', 'light-green', 'lavender', 'light-gray', 'light',
] as const

const VALID_ACCENTS = ['teal', 'purple', 'blue', 'green', 'orange', 'pink', 'gray'] as const

type ValidTheme  = typeof VALID_THEMES[number]
type ValidAccent = typeof VALID_ACCENTS[number]

router.patch('/theme', async (req, res) => {
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { theme, accent } = req.body as { theme?: string; accent?: string }

  if (!theme || !VALID_THEMES.includes(theme as ValidTheme)) {
    return res.status(400).json({ error: 'Invalid theme', code: 'INVALID_THEME' })
  }
  if (!accent || !VALID_ACCENTS.includes(accent as ValidAccent)) {
    return res.status(400).json({ error: 'Invalid accent', code: 'INVALID_ACCENT' })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ theme_preference: { theme, accent } })
    .eq('id', userId)

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true, theme_preference: { theme, accent } })
})

router.patch('/notification-settings', async (req, res) => {
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { disabledTypes } = req.body as { disabledTypes?: string[] }

  const { error } = await supabase
    .from('profiles')
    .update({ notification_settings: { disabledTypes: Array.isArray(disabledTypes) ? disabledTypes : [] } })
    .eq('id', userId)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

router.get('/', async (req, res) => {
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, theme_preference')
    .eq('id', userId)
    .single()

  if (error) return res.status(500).json({ error: error.message })

  return res.json(data)
})

export default router
