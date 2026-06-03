export const WHATSAPP_INQUIRY_SOURCE = 'WhatsApp Inquiry'

export const LEAD_SOURCE_OPTIONS = [
  'WhatsApp',
  WHATSAPP_INQUIRY_SOURCE,
  'Instagram',
  'Facebook',
  'Website',
  'Showroom Visit',
  'IndiaMART',
] as const

export type LeadSource = (typeof LEAD_SOURCE_OPTIONS)[number]
