"use client";

// The round ✕ used to close panels and popovers (.filterCloseBtn). Extra props (onClick,
// popoverTarget, className additions...) pass straight through to the button.
export function CloseButton({
  className,
  label = "닫기",
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { label?: string }) {
  return (
    <button
      type="button"
      className={"filterCloseBtn" + (className ? " " + className : "")}
      aria-label={label}
      title={label}
      {...props}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <line x1="4" y1="4" x2="20" y2="20" />
        <line x1="20" y1="4" x2="4" y2="20" />
      </svg>
    </button>
  );
}
