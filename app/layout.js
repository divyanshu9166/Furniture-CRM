import { Roboto_Mono } from 'next/font/google';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';

const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', weight: ['300', '400', '500', '600', '700'] });

export const metadata = {
  title: 'Furzentic — Smart Store Manager',
  description: 'AI-powered CRM for furniture stores. Manage leads, appointments, inventory, orders, marketing, and more.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${robotoMono.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
