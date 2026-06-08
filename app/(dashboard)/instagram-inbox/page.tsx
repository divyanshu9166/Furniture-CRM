import { SocialInbox } from '@/components/social/social-inbox'

export const metadata = {
  title: 'Instagram Inbox | Kosmic CRM',
  description: 'Instagram DM inbox — read and reply to customer messages',
}

export default function InstagramInboxPage() {
  return <SocialInbox platform="instagram" />
}
