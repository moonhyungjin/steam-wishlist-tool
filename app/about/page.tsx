import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./about.module.css";

// Independent landing/intro page for the tool. Deliberately a plain server component (no client
// JS beyond the two plain <Link>/<a> CTAs) - nothing here needs interactivity, per the project's
// "don't add client components the page doesn't need" rule.
const GITHUB_URL = "https://github.com/moonhyungjin/steam-wishlist-tool";

export const metadata: Metadata = {
  title: "Steam Wishlist Tool — Smarter Game Buying",
  description:
    "Explore your Steam wishlist, compare available game information, and make more informed game-buying decisions.",
  openGraph: {
    title: "Steam Wishlist Tool — Smarter Game Buying",
    description:
      "Explore your Steam wishlist, compare available game information, and make more informed game-buying decisions.",
    type: "website",
  },
};

const FEATURES = [
  {
    title: "Steam Wishlist Import",
    text: "Retrieve a public Steam wishlist using a Steam ID64 - no login required.",
  },
  {
    title: "Game Information",
    text: "Browse available game details, including artwork, price, discount, genre, and release information where available.",
  },
  {
    title: "Search and Filters",
    text: "Find games using the filters and search options supported by the current application.",
  },
  {
    title: "Sorting Options",
    text: "Organize games using the sorting options currently available in the tool.",
  },
  {
    title: "Personal Browsing Experience",
    text: "Review your wishlist in a focused interface designed for personal use.",
  },
];

const STEPS = [
  {
    title: "Find Your Steam ID64",
    text: "Locate the Steam ID64 associated with your profile.",
  },
  {
    title: "Load Your Wishlist",
    text: "Enter the ID64 and retrieve your wishlist.",
  },
  {
    title: "Explore and Compare",
    text: "Search, filter, sort, and review the available game information.",
  },
];

// Real screenshots of the running app (captured from its empty, pre-ID-entry state - not a
// mockup), not a decorative recreation. See public/screenshots/.
function AppScreenshot({ variant }: { variant: "desktop" | "mobile" }) {
  const isDesktop = variant === "desktop";
  return (
    <div className={isDesktop ? styles.previewCard : `${styles.previewCard} ${styles.previewCardMobile}`}>
      <Image
        src={isDesktop ? "/screenshots/wishlist-desktop.png" : "/screenshots/wishlist-mobile.png"}
        alt="Steam Wishlist Tool interface before a Steam ID has been entered, showing the ID input, filters, and sort options"
        width={isDesktop ? 1440 : 390}
        height={isDesktop ? 900 : 844}
        className={styles.previewImg}
        priority={isDesktop}
      />
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.section}>
          <div className={styles.heroGrid}>
            <div>
              <p className={styles.eyebrow}>PERSONAL STEAM WISHLIST TOOL</p>
              <h1 className={styles.headline}>
                Your Wishlist.
                <br />
                Smarter Game Buying.
              </h1>
              <p className={styles.description}>
                A simple way to explore your Steam wishlist, compare game details, and make more
                informed buying decisions.
              </p>
              <div className={styles.ctaRow}>
                <Link href="/" className={styles.ctaPrimary}>
                  Explore My Wishlist
                </Link>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.ctaSecondary}
                >
                  View on GitHub
                </a>
              </div>
            </div>
            <AppScreenshot variant="desktop" />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Your wishlist is a starting point, not a buying decision.
          </h2>
          <p className={styles.sectionDescription}>
            A growing wishlist makes it harder to compare games, spot worthwhile discounts, and
            decide what to play next.
          </p>
          <div className={styles.cardGrid}>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Too Many Games</h3>
              <p className={styles.cardText}>Keep your growing wishlist easier to explore.</p>
            </div>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Better Comparisons</h3>
              <p className={styles.cardText}>Review available game details in one place.</p>
            </div>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Smarter Decisions</h3>
              <p className={styles.cardText}>
                Use price, discount, and other available information to help decide what to buy.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Everything you need to review your wishlist.</h2>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <div className={styles.card} key={f.title}>
                <h3 className={styles.cardTitle}>{f.title}</h3>
                <p className={styles.cardText}>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Get started in three simple steps.</h2>
          <div className={styles.stepGrid}>
            {STEPS.map((step, i) => (
              <div key={step.title}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </div>
            ))}
          </div>
          <p className={styles.howNote}>
            If a wishlist can&apos;t be loaded, the Steam profile may be set to private - Steam
            doesn&apos;t distinguish a private profile from an empty one in its public data.
          </p>
        </section>
      </div>

      <section className={`${styles.section} ${styles.previewSection}`}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>A clearer view of your next purchase.</h2>
          <div className={styles.previewGrid}>
            <AppScreenshot variant="desktop" />
            <AppScreenshot variant="mobile" />
          </div>
        </div>
      </section>

      <div className={styles.container}>
        <section className={`${styles.section} ${styles.finalCta}`}>
          <h2 className={styles.sectionTitle} style={{ margin: "0 auto" }}>
            Ready to revisit your wishlist?
          </h2>
          <p className={styles.sectionDescription} style={{ margin: "14px auto 0" }}>
            Take a fresh look at the games you&apos;ve been saving.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/" className={styles.ctaPrimary}>
              Explore My Wishlist
            </Link>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerTop}>
            <span className={styles.footerBrand}>Steam Wishlist Tool</span>
            <nav className={styles.footerLinks}>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                GitHub repository
              </a>
              <Link href="/">Open the Tool</Link>
            </nav>
          </div>
          <p className={styles.footerDisclaimer}>
            A small personal tool for browsing a Steam wishlist and comparing game details.{" "}
            This is an independent fan-made project and is not affiliated with or endorsed by
            Valve or Steam, or by IsThereAnyDeal. Steam-related names and marks are used only for
            descriptive purposes.
          </p>
        </footer>
      </div>
    </div>
  );
}
