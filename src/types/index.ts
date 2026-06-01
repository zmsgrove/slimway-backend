export type Role = 'developer' | 'owner' | 'franchisee' | 'admin' | 'staff' | 'technical'

export interface AuthUser {
  id: string
  role: Role
  branch_id: string | null
  email: string
}

export interface ClientUser {
  id: string
  branch_id: string
  full_name: string
}

export interface ApiKeyContext {
  branch_id: string
  scopes: string[]
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
      client?: ClientUser
      apiKey?: ApiKeyContext
    }
  }
}

export interface ApiError {
  error: string
  code?: string
}
