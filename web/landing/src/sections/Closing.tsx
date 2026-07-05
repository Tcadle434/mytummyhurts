import { AppStoreButton } from '../components/AppStoreButton';
import { Pip } from '../components/Pip';
import { Reveal } from '../motion/Reveal';

export function Closing() {
  return (
    <section id="get" className="noise relative overflow-hidden bg-evergreen-deep py-28 sm:py-36">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="glow-a absolute -left-[10%] top-[10%] h-[60vh] w-[60vh] rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(150,200,174,0.4), transparent 65%)', filter: 'blur(44px)' }}
        />
        <div
          className="glow-b absolute -right-[12%] bottom-[0%] h-[55vh] w-[55vh] rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(253,163,139,0.35), transparent 65%)', filter: 'blur(48px)' }}
        />
      </div>
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 text-center sm:px-8">
        <Reveal>
          <div className="bob">
            <Pip pose="waving" size={132} eager={false} />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-8 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-on-hero sm:text-6xl">
            Your next meal does not have to be a guess.
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-on-hero-muted sm:text-lg">
            Start with one scan. Seven days free, honest reads from day one.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="mt-10">
            <AppStoreButton variant="hero" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
