// Progressive enhancement only — the page is fully readable without this.

// Single switch for launch day: paste the App Store URL here and every CTA
// goes live (and the "launching soon" note disappears).
const APP_STORE_URL = "";

const noteEl = document.getElementById("cta-note");
for (const btn of document.querySelectorAll("[data-appstore]")) {
  if (APP_STORE_URL) {
    btn.href = APP_STORE_URL;
  } else {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      if (noteEl) {
        noteEl.textContent = "Almost there — the App Store listing goes live with launch.";
        noteEl.style.color = "#96c8ae";
      }
    });
  }
}
if (APP_STORE_URL && noteEl) noteEl.remove();

// Nav: transparent over the evergreen hero, porcelain once scrolled past it.
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Scroll reveals with a gentle stagger per section.
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const seen = new WeakSet();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target);
        const siblings = [...entry.target.parentElement.querySelectorAll(":scope > .reveal")];
        const index = Math.max(0, siblings.indexOf(entry.target));
        entry.target.style.transitionDelay = `${Math.min(index * 70, 350)}ms`;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15 },
  );
  reveals.forEach((el) => observer.observe(el));
} else {
  reveals.forEach((el) => el.classList.add("in"));
}
