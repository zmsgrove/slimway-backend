import { supabase } from '../config/supabase'
import { AuthUser } from '../types'

export async function resolveBranchId(user: AuthUser): Promise<string | null> {
  if (user.branch_id) return user.branch_id
  if (user.role === 'owner') {
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    return branch?.id ?? null
  }
  if (user.role === 'developer') {
    // developer без явного branch_id берёт первый доступный филиал
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .limit(1)
      .single()
    return branch?.id ?? null
  }
  return null
}
