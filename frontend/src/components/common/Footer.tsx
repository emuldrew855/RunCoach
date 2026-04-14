/**
 * Footer Component
 *
 * Simple footer with links to About and Contact pages.
 * Designed to be unobtrusive but accessible throughout the app.
 */

import { Link } from 'react-router-dom';

interface FooterProps {
  className?: string;
}

export default function Footer({ className = '' }: FooterProps) {
  return (
    <footer className={`border-t border-neutral-800 bg-neutral-950 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
          <p className="text-neutral-500">
            © {new Date().getFullYear()} RunCoach
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/about"
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              About
            </Link>
            <span className="text-neutral-700">•</span>
            <Link
              to="/contact"
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Contact & Feedback
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
