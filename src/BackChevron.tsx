export function BackChevron() {
  return (
    <>
      <style>{backChevronStyles}</style>
      <span className="back-chevron-frame" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path
            d="m15 5-7 7 7 7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </svg>
      </span>
    </>
  );
}

const backChevronStyles = `
.back-chevron-frame { width: 40px; height: 32px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; color: var(--white); background: #111; }
.back-chevron-frame svg { width: 22px; height: 22px; }
button:active > .back-chevron-frame { transform: scale(.97); border-color: var(--red); }
button:focus-visible > .back-chevron-frame { border-color: var(--red); box-shadow: 0 0 0 2px rgba(239,40,36,.25); }
`;
