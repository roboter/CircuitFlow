
import React from 'react';

export const Transistor = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
    <path d="M10 7v10M10 12h4M14 7l-4 5 4 5" />
  </svg>
);
