export type Role = 'developer' | 'owner' | 'franchisee' | 'admin' | 'trainer' | 'staff' | 'technical'

export interface AuthUser {
  id: string
  role: Role
  branch_id: string | null
  email: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export interface ApiError {
  error: string
  code?: string
}
