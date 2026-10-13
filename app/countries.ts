// Steam store regions the app can price against. The list is deliberately short: each entry was
// checked live against both Steam (IStoreBrowseService, country_code) and IsThereAnyDeal
// (storelow, country) to confirm that the two return the SAME currency and the same unit (Steam's
// final_price_in_cents / 100 === ITAD's amount), which is what the "is it at its lowest price"
// comparison relies on. Countries where they disagree were left out on purpose:
//   TR - Steam bills in USD, ITAD answers in TRY
//   RU - Steam bills in RUB, ITAD falls back to USD
//   MX - Steam bills in MXN, ITAD falls back to USD
// Comparing across mismatched currencies would silently produce wrong "최저가" badges.
export const COUNTRIES = [
  { code: "KR", label: "대한민국", currency: "KRW" },
  { code: "US", label: "미국", currency: "USD" },
  { code: "JP", label: "일본", currency: "JPY" },
  { code: "DE", label: "유럽 (유로)", currency: "EUR" },
  { code: "GB", label: "영국", currency: "GBP" },
  { code: "CA", label: "캐나다", currency: "CAD" },
  { code: "AU", label: "호주", currency: "AUD" },
  { code: "PL", label: "폴란드", currency: "PLN" },
  { code: "BR", label: "브라질", currency: "BRL" },
  { code: "CN", label: "중국", currency: "CNY" },
  { code: "IN", label: "인도", currency: "INR" },
  { code: "TW", label: "대만", currency: "TWD" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];
export const DEFAULT_COUNTRY: CountryCode = "KR";

export function isSupportedCountry(value: unknown): value is CountryCode {
  return COUNTRIES.some((c) => c.code === value);
}

// Anything missing/unknown falls back to the default instead of erroring - these values arrive
// from query strings and localStorage, neither of which should be able to break a page load.
export function parseCountry(value: string | null | undefined): CountryCode {
  const upper = value?.toUpperCase();
  return isSupportedCountry(upper) ? upper : DEFAULT_COUNTRY;
}

export function countryLabel(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.label ?? code;
}
