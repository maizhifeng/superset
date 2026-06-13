import { keyframes } from "@emotion/react";

export const cardEnter = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const toolFadeIn = keyframes`
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
`;

export const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const blink = keyframes`
  50% { opacity: 0; }
`;

export const paperReveal = keyframes`
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

export const warmGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(184, 101, 58, 0); }
  50% { box-shadow: 0 0 12px 2px rgba(184, 101, 58, 0.12); }
`;

export const fadeInScale = keyframes`
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
`;

export const staggerSlide = keyframes`
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
`;

export const colorSlide = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
  50% { box-shadow: 0 0 16px 4px rgba(0,0,0,0.08); }
`;
