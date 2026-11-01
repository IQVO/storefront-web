// Inline SVG icons (markup, not inline style: allowed by the strict CSP). Decorative: aria-hidden.
export function SearchIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg className="icon cart-icon" viewBox="0 0 32 28" width="38" height="32" aria-hidden="true" focusable="false">
      <path d="M2 4h4l3.6 14.2a2 2 0 0 0 2 1.5h12.8a2 2 0 0 0 1.9-1.4L29 8.5H8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="12.5" cy="24.5" r="2" fill="currentColor" />
      <circle cx="23.5" cy="24.5" r="2" fill="currentColor" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 22s7-6.6 7-12.2A7 7 0 0 0 5 9.8C5 15.4 12 22 12 22Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="9.8" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg className="icon check-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path d="m7 12.5 3.2 3.2L17.5 8.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
