import Image from "next/image";
import Link from "next/link";
import styles from "./about.module.css";
import { GITHUB_URL, type AboutContent } from "./content";

// Shared by app/about/page.tsx (English, default) and app/about/ko/page.tsx (Korean) - two
// static routes with the same structure instead of a client-side language switch, so each
// language stays server-rendered and fully indexable (per the project's SEO/no-unnecessary-
// client-components guidance). Switching "language" here means a real page navigation that swaps
// every piece of content, not a toggle over partial copy.
function AppScreenshot({
  src,
  alt,
  caption,
  priority,
}: {
  src: string;
  alt: string;
  caption?: string;
  priority?: boolean;
}) {
  return (
    <figure className={styles.previewCard}>
      <Image src={src} alt={alt} width={1440} height={900} className={styles.previewImg} priority={priority} />
      {caption && <figcaption className={styles.previewCaption}>{caption}</figcaption>}
    </figure>
  );
}

export function AboutView({ content: c }: { content: AboutContent }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.langSwitchRow}>
          <Link href={c.switchHref} className={styles.langSwitch}>
            {c.switchLabel}
          </Link>
        </div>
        <section className={styles.section}>
          <div className={styles.heroGrid}>
            <div>
              <p className={styles.eyebrow}>{c.eyebrow}</p>
              <h1 className={styles.headline}>
                {c.headlineLines[0]}
                <br />
                {c.headlineLines[1]}
              </h1>
              <p className={styles.description}>{c.description}</p>
              <div className={styles.ctaRow}>
                <Link href="/" className={styles.ctaPrimary}>
                  {c.ctaPrimary}
                </Link>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.ctaSecondary}
                >
                  {c.ctaSecondary}
                </a>
              </div>
            </div>
            <AppScreenshot src="/screenshots/wishlist-hero.png" alt={c.heroAlt} priority />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{c.problemTitle}</h2>
          <p className={styles.sectionDescription}>{c.problemDescription}</p>
          <div className={styles.cardGrid}>
            {c.problemCards.map((card) => (
              <div className={styles.card} key={card.title}>
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardText}>{card.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{c.featuresTitle}</h2>
          <div className={styles.featureGrid}>
            {c.features.map((f) => (
              <div className={styles.card} key={f.title}>
                <h3 className={styles.cardTitle}>{f.title}</h3>
                <p className={styles.cardText}>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{c.stepsTitle}</h2>
          <div className={styles.stepGrid}>
            {c.steps.map((step, i) => (
              <div key={step.title}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </div>
            ))}
          </div>
          <p className={styles.howNote}>{c.howNote}</p>
        </section>
      </div>

      <section className={`${styles.section} ${styles.previewSection}`}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>{c.previewTitle}</h2>
          <div className={styles.previewGrid}>
            <AppScreenshot
              src="/screenshots/wishlist-discount.png"
              alt={c.previewDiscountAlt}
              caption={c.previewDiscountCaption}
            />
            <AppScreenshot
              src="/screenshots/library-ratings.png"
              alt={c.previewLibraryAlt}
              caption={c.previewLibraryCaption}
            />
          </div>
        </div>
      </section>

      <div className={styles.container}>
        <section className={`${styles.section} ${styles.finalCta}`}>
          <h2 className={styles.sectionTitle} style={{ margin: "0 auto" }}>
            {c.finalCtaTitle}
          </h2>
          <p className={styles.sectionDescription} style={{ margin: "14px auto 0" }}>
            {c.finalCtaDescription}
          </p>
          <div className={styles.ctaRow}>
            <Link href="/" className={styles.ctaPrimary}>
              {c.ctaPrimary}
            </Link>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerTop}>
            <span className={styles.footerBrand}>{c.footerBrand}</span>
            <nav className={styles.footerLinks}>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                {c.footerGithub}
              </a>
              <Link href="/">{c.footerOpenTool}</Link>
            </nav>
          </div>
          <p className={styles.footerDisclaimer}>{c.footerDisclaimer}</p>
        </footer>
      </div>
    </div>
  );
}
