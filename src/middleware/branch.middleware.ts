import { Request, Response, NextFunction } from 'express'

// Добавляет branch_id в req для удобного использования в роутах.
// Owner может передать ?branch_id= явно, остальные — только свой.
export function resolveBranch(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_USER' })
  }

  const { role, branch_id } = req.user

  if (role === 'developer' || role === 'owner') {
    // developer и owner могут смотреть любой филиал через query param
    const queryBranch = req.query.branch_id as string | undefined
    req.user.branch_id = queryBranch || null
  } else {
    // все остальные видят только свой филиал
    if (!branch_id) {
      return res.status(403).json({ error: 'No branch assigned', code: 'NO_BRANCH' })
    }
    req.user.branch_id = branch_id
  }

  next()
}
