import CallToAction from "../components/landing/CallToAction";
import DashboardPreview from "../components/landing/DashboardPreview";
import Faq from "../components/landing/Faq";
import Features from "../components/landing/Features";
import Footer from "../components/landing/Footer";
import Hero from "../components/landing/Hero";
import HowItWorks from "../components/landing/HowItWorks";
import LandingNav from "../components/landing/LandingNav";
import Stats from "../components/landing/Stats";
import Testimonials from "../components/landing/Testimonials";
import WhyChooseUs from "../components/landing/WhyChooseUs";

/**
 * The public marketing page.
 *
 * Assembled from one component per section so a section can be reordered,
 * reworded or dropped without touching the others. All copy lives in
 * `components/landing/content.js`.
 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNav />

      {/* `main` starts at the hero so a screen reader's "skip to content"
          lands on the headline rather than the nav. */}
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <WhyChooseUs />
        <Stats />
        <DashboardPreview />
        <Testimonials />
        <Faq />
        <CallToAction />
      </main>

      <Footer />
    </div>
  );
}
