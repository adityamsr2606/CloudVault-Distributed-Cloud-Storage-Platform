import { Laptop, Moon, Sun } from "lucide-react";

import { useTheme, type ThemePreference } from "../theme/ThemeProvider";

const options: Array<[ThemePreference, string, typeof Sun]> = [
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
  ["system", "System", Laptop],
];

export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();

  return (
    <div className={`theme-switcher ${compact ? "compact" : ""}`} aria-label="Appearance">
      {options.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          title={label}
          className={preference === value ? "active" : ""}
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
        >
          <Icon size={14} />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
