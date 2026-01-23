
import React from 'react';

export const LED = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 6v12l10-6-10-6zM17 6v12" />
    <path d="M13 5l2-3M17 7l2-3" strokeWidth="1.5" />
  </svg>
);
