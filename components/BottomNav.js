export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[80] md:hidden"
      role="navigation"
      aria-label="Bottom margin buffer"
    >
      <div
        className="border-t border-border/60"
        style={{
          background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
        }}
      >
        {/* Blank spacer buffer above the device navigation bar */}
        <div className="flex items-center justify-around px-1 h-[28px]" />
      </div>
    </nav>
  );
}
