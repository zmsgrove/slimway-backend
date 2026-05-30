export type Role = 'developer' | 'owner' | 'franchisee' | 'admin' | 'staff' | 'technical'
export type PermissionState = 'allow' | 'deny' | 'locked'

export const DEFAULT_PERMISSIONS: Record<string, Record<string, Role[]>> = {
  clients: {
    view:   ['developer','owner','franchisee','admin','staff'],
    create: ['developer','owner','franchisee','admin','staff'],
    edit:   ['developer','owner','franchisee','admin','staff'],
    delete: ['developer','owner','franchisee','admin'],
  },
  leads: {
    view:   ['developer','owner','franchisee','admin','staff'],
    create: ['developer','owner','franchisee','admin','staff'],
    edit:   ['developer','owner','franchisee','admin','staff'],
    delete: ['developer','owner','franchisee','admin'],
  },
  bookings: {
    view:         ['developer','owner','franchisee','admin','staff'],
    create:       ['developer','owner','franchisee','admin','staff'],
    cancel_early: ['developer','owner','franchisee','admin','staff'],
    cancel_late:  ['developer','owner','franchisee'],
  },
  subscriptions: {
    view:   ['developer','owner','franchisee','admin','staff'],
    create: ['developer','owner','franchisee','admin','staff'],
    edit:   ['developer','owner','franchisee','admin'],
    delete: ['developer','owner','franchisee'],
  },
  schedule: {
    view:   ['developer','owner','franchisee','admin','staff'],
    create: ['developer','owner','franchisee','admin','staff'],
    edit:   ['developer','owner','franchisee','admin','staff'],
  },
  shifts: {
    view:   ['developer','owner','franchisee','admin','staff','technical'],
    create: ['developer','owner','franchisee'],
    edit:   ['developer','owner','franchisee'],
    delete: ['developer','owner','franchisee'],
  },
  employees: {
    view:   ['developer','owner','franchisee','admin'],
    create: ['developer','owner','franchisee'],
    edit:   ['developer','owner','franchisee'],
    delete: ['developer','owner','franchisee'],
  },
  warehouse: {
    view:   ['developer','owner','franchisee','admin','staff'],
    create: ['developer','owner','franchisee','admin'],
    edit:   ['developer','owner','franchisee','admin'],
    delete: ['developer','owner','franchisee'],
  },
  analytics: {
    view: ['developer','owner','franchisee','admin'],
  },
  tasks: {
    view:   ['developer','owner','franchisee','admin','staff'],
    create: ['developer','owner','franchisee','admin','staff'],
    edit:   ['developer','owner','franchisee','admin','staff'],
    delete: ['developer','owner','franchisee','admin'],
  },
  management: {
    view: ['developer','owner','franchisee'],
    edit: ['developer','owner','franchisee'],
  },
  settings: {
    view: ['developer','owner','franchisee','admin','staff','technical'],
    edit: ['developer','owner','franchisee'],
  },
  permissions: {
    view: ['developer','owner','franchisee'],
    edit: ['developer','owner','franchisee'],
  },
}

export interface PermissionOverride {
  id?: string
  role: Role
  resource: string
  action: string
  state: PermissionState
  set_by: Role
  branch_id: string | null
}

export function can(
  role: Role,
  resource: string,
  action: string,
  overrides?: PermissionOverride[]
): boolean {
  if (role === 'developer') return true

  if (overrides) {
    const override = overrides.find(
      o => o.resource === resource && o.action === action
    )
    if (override) {
      if (override.state === 'locked') return false
      if (override.state === 'allow')  return true
      if (override.state === 'deny')   return false
    }
  }

  return DEFAULT_PERMISSIONS[resource]?.[action]?.includes(role) ?? false
}

export const PERMISSION_EDIT_RULES: Record<Role, Role[]> = {
  developer:  ['owner','franchisee','admin','staff','technical'],
  owner:      ['franchisee','admin','staff','technical'],
  franchisee: ['admin','staff','technical'],
  admin:      [],
  staff:      [],
  technical:  [],
}

export const CREATION_RULES: Record<Role, Role[]> = {
  developer:  ['owner','franchisee','admin','staff','technical'],
  owner:      ['franchisee','admin','staff','technical'],
  franchisee: ['admin','staff','technical'],
  admin:      [],
  staff:      [],
  technical:  [],
}

export function canSetLocked(role: Role): boolean {
  return role === 'developer'
}

export function canEditRolePermissions(actor: Role, target: Role): boolean {
  if (actor === 'developer') return true
  return PERMISSION_EDIT_RULES[actor]?.includes(target) ?? false
}
