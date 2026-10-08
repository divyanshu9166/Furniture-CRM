export default function BottomNav() {
  return (
    // Only protect the device safe area. There are no footer navigation actions;
    // the former 36px blank bar obscured content and overlaid the mobile drawer.
    <div aria-hidden="true" className="pointer-events-none fixed bottom-0 inset-x-0 z-30 md:hidden bg-background"
      style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
  );
}
