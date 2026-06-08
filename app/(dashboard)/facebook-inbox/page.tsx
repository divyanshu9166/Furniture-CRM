import { SocialInbox } from '@/components/social/social-inbox'

export const metadata = {
  title: 'Facebook Inbox | Kosmic CRM',
  description: 'Facebook Page Messages inbox — read and reply to customer DMs',
}

export default function FacebookInboxPage() {
  return <SocialInbox platform="facebook" />
}
