import { Roboto_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import { SidebarProvider } from '@/components/SidebarContext';

const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', weight: ['300', '400', '500', '600', '700'] });

export const metadata = {
  title: 'FurnitureCRM — Smart Store Manager',
  description: 'AI-powered CRM for furniture stores. Manage leads, appointments, inventory, orders, marketing, and more.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${robotoMono.variable} font-sans antialiased`}>
        <SidebarProvider>
          <div className="flex min-h-screen bg-background">
            <Sidebar />
            <div className="flex-1 md:ml-[260px] ml-0 min-w-0 overflow-hidden transition-all duration-300">
              <TopBar />
              <main className="p-4 md:p-6 overflow-x-hidden pb-24 md:pb-6">
                {children}
              </main>
            </div>
            <BottomNav />
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
