// Progressive enhancement only — the page is fully readable without this.
// (index.html adds the `js` class to <html> inline, so reveal styling only
// ever applies when this script is going to run. The `enhanced` flag tells
// the inline watchdog that we actually arrived.)
document.documentElement.classList.add("enhanced");

// Single switch for launch day: paste the App Store URL here and every CTA
// goes live (and the "launching soon" notes disappear).
const APP_STORE_URL = "";

const noteEls = document.querySelectorAll(".cta-note");
for (const btn of document.querySelectorAll("[data-appstore]")) {
  if (APP_STORE_URL) {
    btn.href = APP_STORE_URL;
  } else {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      for (const note of noteEls) {
        note.textContent = "Almost there — the App Store listing goes live with launch.";
        note.style.color = "#96c8ae";
      }
    });
  }
}
if (APP_STORE_URL) noteEls.forEach((note) => note.remove());

// Nav: transparent over the evergreen hero, porcelain once scrolled past it.
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Scroll reveals with a gentle stagger per section, plus the CLEARED stamp
// slamming onto the caseboard once it's in view.
const reveals = document.querySelectorAll(".reveal");
const stamp = document.querySelector(".stamp");

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

  if (stamp) {
    const stampObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setTimeout(() => stamp.classList.add("stamped"), 500);
          stampObserver.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    stampObserver.observe(stamp.parentElement);
  }
} else {
  reveals.forEach((el) => el.classList.add("in"));
  if (stamp) stamp.classList.add("stamped");
}
