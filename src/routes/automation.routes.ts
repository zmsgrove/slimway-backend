import { Router, Request, Response } from 'express'

const router = Router()

// GET /automation — placeholder, module coming soon
router.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Automation module — coming soon' })
})

export default router
