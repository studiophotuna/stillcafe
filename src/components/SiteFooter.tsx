export function SiteFooter() {
  return (
    <footer className="border-t border-latte bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 text-[12px] text-espresso/30">
        <span>Still Café · Mobile Coffee Cart</span>
        <span>&copy; {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
