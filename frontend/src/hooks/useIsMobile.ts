import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current viewport is mobile sized
 * @param breakpoint - The breakpoint in pixels (default: 768px for tablets and below)
 * @returns boolean indicating if viewport is mobile
 */
export const useIsMobile = (breakpoint: number = 768): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // Check on mount
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();

    // Listen for resize
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
};
