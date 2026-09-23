export const metadata = {
  title: 'Welcome — Register Your Visit',
  description: 'Register your visit at our showroom. Our team will assist you shortly.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function WalkinFormLayout({ children }) {
  return (
    <div className="font-sans">
      {children}
    </div>
  );
}
