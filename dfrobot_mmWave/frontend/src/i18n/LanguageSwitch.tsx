import { useLocale } from "./LocaleContext";
import type { Locale } from "./types";

export function LanguageSwitch({ variant = "welcome" }: { variant?: "welcome" | "sidebar" }) {
  const { locale, setLocale, t } = useLocale();
  const options: Locale[] = ["zh", "en"];

  return (
    <div className={variant === "sidebar" ? "sidebar-lang-switch" : "welcome-lang-switch"}>
      {variant === "welcome" ? <span className="lang-switch-label">{t("lang.label")}</span> : null}
      <div className="lang-switch-options" role="group" aria-label={t("lang.label")}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={locale === option ? "lang-switch-btn active" : "lang-switch-btn"}
            onClick={() => setLocale(option)}
          >
            {t(option === "zh" ? "lang.zh" : "lang.en")}
          </button>
        ))}
      </div>
    </div>
  );
}
