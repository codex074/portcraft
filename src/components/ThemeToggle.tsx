import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <label className="theme-toggle-btn">
      <input
        type="checkbox"
        className="theme-toggle-input"
        checked={isDark}
        onChange={toggleTheme}
      />
      <svg viewBox="0 0 69.667 44" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(3.5 3.5)">
          <rect className="tt-container" fill="#83cbd8" rx="17.5" height="35" width="60.667" />
          <g transform="translate(2.333 2.333)" className="tt-button">
            <g className="tt-sun">
              <circle fill="#f8e664" r="15.167" cx="15.167" cy="15.167" />
              <circle fill="#fcf4b9" r="7" cx="15.167" cy="15.167" />
            </g>
            <g className="tt-moon">
              <circle fill="#cce6ee" r="15.167" cx="43" cy="15.167" />
              {/* Craters */}
              <circle fill="#a8c4d0" r="4" cx="48" cy="9" />
              <circle fill="#a8c4d0" r="2.5" cx="39.5" cy="21.5" />
              <circle fill="#a8c4d0" r="2" cx="52" cy="18" />
            </g>
          </g>
          <path className="tt-cloud" fill="#fff"
            d="M46 18c1.2-3 4-4 6-3 0-2 2-3 3-3 3 0 5 2 5 5 3 0 5 2 5 4 0 3-3 4-6 4H47c-3 0-5-2-5-4 0-2 2-3 4-3z"
          />
          <g className="tt-stars" fill="#def8ff">
            <circle cx="10" cy="8" r="1" />
            <circle cx="20" cy="5" r="1" />
            <circle cx="30" cy="10" r="1" />
            <circle cx="15" cy="15" r="1" />
          </g>
        </g>
      </svg>
    </label>
  );
}
