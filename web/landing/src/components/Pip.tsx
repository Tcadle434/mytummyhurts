// Only the poses the page uses ship as assets. To add one, whitelist it in
// scripts/prepare-images.mjs, run `npm run images`, then extend this map.
const PIP_POSES = {
  thinking: 'pip-thinking',
  waving: 'pip-waving',
  joy: 'pip-joyous',
  love: 'pip-love',
  anxious: 'pip-anxious',
  sleepy: 'pip-sleepy',
} as const;

export type PipPose = keyof typeof PIP_POSES;

interface PipProps {
  pose: PipPose;
  size: number;
  className?: string;
  /** Above-the-fold Pips should load eagerly. */
  eager?: boolean;
  alt?: string;
}

export function Pip({ pose, size, className = '', eager = false, alt }: PipProps) {
  return (
    <img
      src={`/assets/pip/${PIP_POSES[pose]}.webp`}
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      alt={alt ?? `Pip the stomach mascot, ${pose} expression`}
      className={className}
      draggable={false}
    />
  );
}
