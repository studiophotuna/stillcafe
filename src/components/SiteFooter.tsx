export function SiteFooter() {
  return (
    <footer className="border-t border-latte/40 bg-sand/50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 text-xs text-espresso/50">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-espresso/10 text-[8px] font-bold text-espresso/60">
            SC
          </div>
          <span>Still Caf&eacute; &middot; Mobile Coffee Cart</span>
        </div>
        <span>&copy; {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
