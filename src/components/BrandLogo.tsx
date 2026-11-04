import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className = ''
}) => {
  if (size === 'sm') {
    return (
      <div className={`flex flex-col leading-none select-none ${className}`}>
        <span className="font-extrabold text-[15px] tracking-tight text-fruit-text font-syne">
          OpenFruit
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-fruit-accent font-semibold mt-0.5">
          Studio
        </span>
      </div>
    );
  }

  if (size === 'lg') {
    return (
      <div className={`flex flex-col items-start w-full max-w-sm select-none ${className}`}>
        <h1 className="text-[40px] sm:text-[44px] font-extrabold tracking-tight font-syne text-fruit-text leading-none whitespace-nowrap">
          OpenFruit
        </h1>
        {showSubtitle && (
          <div className="mt-1.5 font-mono text-xs tracking-[0.28em] text-fruit-accent font-semibold uppercase">
            Studio
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col leading-none select-none ${className}`}>
      <span className="font-bold text-lg tracking-tight text-fruit-text font-syne">
        OpenFruit
      </span>
      <span className="font-mono text-[10px] tracking-widest text-fruit-accent uppercase font-semibold mt-0.5">
        Studio
      </span>
    </div>
  );
};
