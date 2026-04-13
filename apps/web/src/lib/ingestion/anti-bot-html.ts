/**
 * Heuristika skutečné blokace (Cloudflare, reCAPTCHA…) vs. falešné pozitivy
 * (např. podřetězec „captcha“ v interním odkazu CMS).
 */
export function detectLikelyAntiBotWall(html: string): boolean {
  return (
    /cloudflare|__cf_bm|cf-ray|challenges\.cloudflare|turnstile/i.test(
      html,
    ) ||
    /verify you are human|are you a robot|robot.?check/i.test(html) ||
    /\bhcaptcha\b|\brecaptcha\b|g-recaptcha|data-sitekey=/i.test(html) ||
    /unusual traffic|automated access|access to this page has been denied/i.test(
      html,
    )
  );
}
