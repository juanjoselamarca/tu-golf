import type { SupabaseClient } from '@supabase/supabase-js'

export async function trackEvent(
  supabase: SupabaseClient,
  userId: string | null,
  eventType: string,
  eventData: Record<string, unknown> = {}
) {
  try {
    const isMobile = typeof window !== 'undefined'
      ? window.innerWidth < 768 : false
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_type: eventType,
      event_data: eventData,
      device_type: isMobile ? 'mobile' : 'desktop',
    })
  } catch (e) {
    console.warn('[Analytics]', e)
  }
}
