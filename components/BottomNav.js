export default function BottomNav() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[80] md:hidden"
      style={{
        background: 'var(--color-background)',
        height: 'calc(env(safe-area-inset-bottom, 16px) + 16px)'
      }}
    />
  );
}
