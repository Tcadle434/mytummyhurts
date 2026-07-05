import { Footer } from './components/Footer';
import { Nav } from './components/Nav';
import { Closing } from './sections/Closing';
import { Faq } from './sections/Faq';
import { GutScorePillar } from './sections/GutScorePillar';
import { Hero } from './sections/Hero';
import { Honesty } from './sections/Honesty';
import { HowItWorks } from './sections/HowItWorks';
import { LearnPillar } from './sections/LearnPillar';
import { Moment } from './sections/Moment';
import { PipRow } from './sections/PipRow';
import { ScanPillar } from './sections/ScanPillar';

export function App() {
  return (
    <>
      <a
        href="#how"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <Moment />
        <HowItWorks />
        <ScanPillar />
        <GutScorePillar />
        <LearnPillar />
        <Honesty />
        <PipRow />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
