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
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        {/* Blank spacer to maintain the exact same height as the old navbar without menus */}
        <div className="flex items-center justify-around px-1 h-[60px]" />
      </div>
    </nav>
  );
}
