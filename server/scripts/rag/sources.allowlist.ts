// Hard allowlist for the corpus seed scraper. Only these reputable, ToS-checked
// sources may be fetched, and only the specific curated seed URLs listed. No
// open-web crawling / spidering. Tier 1 = government/public-domain (highest
// trust); Tier 2 = authoritative nonprofits/professional bodies; Tier 3 =
// vetted individual RD blogs (require explicit per-source legal sign-off; OFF by
// default). Everything scraped lands as status='draft' and must be human-published.
export interface SeedSource {
  name: string;
  host: string;
  tier: 1 | 2 | 3;
  enabled: boolean;
  conditionTags: string[];
  seedUrls: string[];
}

export const SEED_SOURCES: SeedSource[] = [
  {
    name: 'NIDDK (NIH)',
    host: 'niddk.nih.gov',
    tier: 1,
    enabled: true,
    conditionTags: ['IBS', 'GERD', 'lactose_intolerance'],
    seedUrls: [
      'https://www.niddk.nih.gov/health-information/digestive-diseases/irritable-bowel-syndrome/eating-diet-nutrition',
      'https://www.niddk.nih.gov/health-information/digestive-diseases/acid-reflux-ger-gerd-adults/eating-diet-nutrition',
      'https://www.niddk.nih.gov/health-information/digestive-diseases/lactose-intolerance',
    ],
  },
  {
    name: 'MedlinePlus (NLM)',
    host: 'medlineplus.gov',
    tier: 1,
    enabled: true,
    conditionTags: ['IBS', 'GERD'],
    seedUrls: [
      'https://medlineplus.gov/irritablebowelsyndrome.html',
      'https://medlineplus.gov/gerd.html',
    ],
  },
  {
    name: 'Monash FODMAP',
    host: 'monashfodmap.com',
    tier: 2,
    enabled: true,
    conditionTags: ['IBS', 'high_fodmap'],
    seedUrls: [
      // Excerpt + link-back only; respect robots.txt and ToS.
      'https://www.monashfodmap.com/about-fodmap-and-ibs/',
    ],
  },
  {
    name: 'IFFGD',
    host: 'iffgd.org',
    tier: 2,
    enabled: true,
    conditionTags: ['IBS', 'GERD'],
    seedUrls: ['https://iffgd.org/gi-disorders/irritable-bowel-syndrome/diet-and-ibs/'],
  },
  {
    name: 'GI Society (badgut.org)',
    host: 'badgut.org',
    tier: 2,
    enabled: true,
    conditionTags: ['GERD', 'IBS'],
    seedUrls: ['https://badgut.org/information-centre/a-z-digestive-topics/gerd-diet/'],
  },
];
