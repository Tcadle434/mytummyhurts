import { PRICE_LINE } from '../config';
import { Reveal } from '../motion/Reveal';

const FAQS = [
  {
    q: 'Which conditions does it cover?',
    a: 'You pick the profiles that apply to you: IBS, reflux, lactose or gluten sensitivity. Every scan is read through your profile, so the same dish can score differently for different guts.',
  },
  {
    q: 'Is this medical advice?',
    a: 'No. MyTummyHurts spots patterns between what you eat and how you feel. It is not a medical device and it is not a substitute for a clinician, especially for allergies, celiac disease or IBD.',
  },
  {
    q: 'Do I have to log every meal?',
    a: 'No food-diary homework. Scans are the input, and one nightly tap (how did your gut feel, zero to ten) is the only habit. The app does the bookkeeping.',
  },
  {
    q: 'What happens to my photos and reports?',
    a: 'Core infrastructure is self-hosted on our own servers. AI analysis requests go to OpenAI, subscriptions run through Apple and RevenueCat. You can delete your account and its data from Settings at any time.',
  },
  {
    q: 'What does it cost?',
    a: `${PRICE_LINE}. Cancel from your Apple subscriptions like any other app.`,
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-canvas py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <h2 className="text-center font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-4xl">
            Fair questions
          </h2>
        </Reveal>
        <div className="mt-12 flex flex-col gap-3">
          {FAQS.map((faq, index) => (
            <Reveal key={faq.q} delay={index * 0.06}>
              <details className="group rounded-panel bg-white p-6 shadow-card open:shadow-lift">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold tracking-tight text-ink [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <svg
                    className="flex-none transition-transform duration-300 group-open:rotate-45"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1B5A40"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{faq.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
