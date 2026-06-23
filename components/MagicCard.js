'use client';

import { useRef, useCallback } from 'react';

/**
 * MagicCard — a minimal, dependency-free spotlight-on-hover card.
 * Inspired by Magic UI's Magic Card, rebuilt with our design tokens so it
 * works in light/dark mode and adds zero runtime libraries.
 *
 * The spotlight only reacts to pointer movement (desktop hover), so it costs
 * nothing on touch devices.
 */
export default function MagicCard({
    children,
    className = '',
    contentClassName = '',
    gradientColor,
    gradientSize = 220,
    gradientOpacity = 0.14,
    as: Tag = 'div',
    ...props
}) {
    const ref = useRef(null);

    const handleMove = useCallback((e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        el.style.setProperty('--my', `${e.clientY - rect.top}px`);
        el.style.setProperty('--spot-opacity', String(gradientOpacity));
    }, [gradientOpacity]);

    const handleLeave = useCallback(() => {
        const el = ref.current;
        if (el) el.style.setProperty('--spot-opacity', '0');
    }, []);

    const spotStyle = { '--spot-size': `${gradientSize}px` };
    if (gradientColor) spotStyle['--spot-color'] = gradientColor;

    return (
        <Tag
            ref={ref}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            className={`magic-card ${className}`}
            {...props}
        >
            <span className="magic-card__spot" aria-hidden="true" style={spotStyle} />
            <div className={`magic-card__content ${contentClassName}`}>{children}</div>
        </Tag>
    );
}
