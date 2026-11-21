import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ANIMATION_SPEED_SCALE } from '../../config/animations';

interface CountUpNumberProps {
  value: number;
  durationMs?: number;
  suffix?: string;
}

export const CountUpNumber: React.FC<CountUpNumberProps> = ({
  value,
  durationMs = 680,
  suffix = '',
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const prevValueRef = useRef<number>(0);
  const [display, setDisplay] = useState<number>(prefersReduced ? value : 0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value);
      prevValueRef.current = value;
      return;
    }

    let frameId: number;
    const startVal = prevValueRef.current;
    const effectiveDuration = Math.max(120, durationMs * ANIMATION_SPEED_SCALE);
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / effectiveDuration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (value - startVal) * eased);
      setDisplay(current);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = value;
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      prevValueRef.current = value;
    };
  }, [value, durationMs, prefersReduced]);

  return (
    <span className="tabular-nums">
      {display.toLocaleString('id-ID')}
      {suffix}
    </span>
  );
};
