import React from 'react'

function LogoMark() {
  return (
    <svg
      viewBox="380 230 440 240"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shimmerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="rgba(255, 255, 255, 0.6)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <linearGradient id="skeletonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F1F5F9" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <filter id="edgeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <clipPath id="iconClip">
          <rect x="380" y="230" width="440" height="240" rx="24" />
        </clipPath>
      </defs>

      <g transform="translate(600 350) scale(0.95) translate(-600 -350)">
        <g className="breathing-group">
          <rect
            x="380"
            y="230"
            width="440"
            height="240"
            rx="24"
            fill="url(#skeletonGradient)"
            fillOpacity="0.8"
            stroke="var(--dark-sky-blue)"
            strokeWidth="1.5"
            strokeOpacity="0.1"
          />

          <rect
            x="380"
            y="230"
            width="440"
            height="240"
            rx="24"
            fill="none"
            stroke="var(--dark-sky-blue)"
            strokeWidth="3"
            strokeLinecap="round"
            className="border-draw"
          />

          <path
            d="M440 400 V300 L490 350 L540 300 V400"
            fill="none"
            stroke="var(--dark-sky-blue)"
            strokeWidth="24"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="logo-draw"
            style={{ animationDelay: '0.4s' }}
          />

          <g className="arrow-group">
            <line
              x1="700"
              y1="300"
              x2="700"
              y2="400"
              stroke="var(--dark-sky-blue)"
              strokeWidth="24"
              strokeLinecap="round"
              className="logo-draw"
              style={{ animationDelay: '0.8s' }}
            />
            <path
              d="M640 350 L700 410 L760 350"
              fill="none"
              stroke="var(--dark-sky-blue)"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="logo-draw"
              style={{ animationDelay: '1.2s' }}
            />
          </g>

          <g clipPath="url(#iconClip)">
            <rect className="shimmer-rect" x="0" y="230" width="200" height="240" />
          </g>

          <rect
            x="380"
            y="230"
            width="440"
            height="240"
            rx="24"
            fill="none"
            stroke="var(--accent-glow)"
            strokeWidth="2"
            filter="url(#edgeGlow)"
            opacity="0.5"
          />
        </g>
      </g>
    </svg>
  )
}

export default LogoMark
