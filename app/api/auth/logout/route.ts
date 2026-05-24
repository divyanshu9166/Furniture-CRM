import { NextResponse } from 'next/server'
import { deleteSession } from '@/lib/session'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createSupabaseClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.warn('Supabase sign-out failed:', error.message)
    }
  } catch (err) {
    console.warn('Supabase sign-out error:', err)
  }

  await deleteSession()
  return NextResponse.json({ success: true })
}
