// Shared by the two buttons in the bottom row (share / submit) - pulled out once it became clear
// they needed the exact same sizing fix (fixed height instead of vertical padding, which let their
// heights drift apart whenever one button's text wrapped to two lines and the other didn't).
export function PollButton({
  variant,
  onClick,
  disabled,
  children,
}: {
  variant: "primary" | "ghost";
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`pollBtn pollBtn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
