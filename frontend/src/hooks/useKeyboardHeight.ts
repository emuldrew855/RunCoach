import { useState, useEffect } from 'react';

/**
 * Hook to track keyboard visibility and height on mobile devices
 * Uses visualViewport API for accurate keyboard detection
 * @returns object with isKeyboardVisible and keyboardHeight
 */
export const useKeyboardHeight = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // Only run on mobile devices
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const handleResize = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;

      // Calculate keyboard height
      const heightDiff = window.innerHeight - viewport.height;

      if (heightDiff > 150) {
        // Keyboard is likely visible (threshold of 150px to avoid false positives)
        setKeyboardHeight(heightDiff);
        setIsKeyboardVisible(true);
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
    };
  }, []);

  return { isKeyboardVisible, keyboardHeight };
};
