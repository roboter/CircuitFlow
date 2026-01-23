
import React from 'react';

export const DIP = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="6" y="4" width="12" height="16" rx="1" />
    <path d="M4 6h2M4 10h2M4 14h2M4 18h2M18 6h2M18 10h2M18 14h2M18 18h2" />
    <circle cx="12" cy="6" r="1" fill="currentColor" />
  </svg>
);
