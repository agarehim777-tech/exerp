import React from 'react';

function hashHue(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export default function Avatar({ name = '?', size = 36 }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
  const hue = hashHue(name);
  const style = {
    width: size, height: size, borderRadius: '50%',
    background: `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue+40)%360} 70% 45%))`,
    color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: size * 0.4, letterSpacing: 0.5, flex: '0 0 auto',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };
  return <span style={style} aria-hidden>{initials}</span>;
}
