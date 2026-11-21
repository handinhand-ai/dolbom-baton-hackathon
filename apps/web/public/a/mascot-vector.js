// Symmetric, resolution-independent mascot illustration. Original raster assets are preserved.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 340" role="img" aria-label="돌봄바통 캐릭터">
<defs>
  <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".86" stop-color="#fcfcff"/><stop offset="1" stop-color="#e7e7ee"/></linearGradient>
  <linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff9d3d"/><stop offset="1" stop-color="#f47c1c"/></linearGradient>
  <linearGradient id="pads" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#d9142a"/><stop offset=".52" stop-color="#f02940"/><stop offset="1" stop-color="#e21b30"/></linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="2.2"/></filter>
</defs>
<!-- Full headband and pads are drawn with mirrored geometry around x=160. -->
<path d="M44 139 C42 70 90 30 160 30 C230 30 278 70 276 139" fill="none" stroke="#bb1124" stroke-width="18" stroke-linecap="round"/>
<path d="M44 139 C42 70 90 30 160 30 C230 30 278 70 276 139" fill="none" stroke="#f0293d" stroke-width="12" stroke-linecap="round"/>
<g fill="url(#pads)" stroke="#d51b2e" stroke-width="2">
<rect x="25" y="119" width="35" height="91" rx="18"/>
<rect x="260" y="119" width="35" height="91" rx="18"/>
</g>
<path d="M52 135 C51 64 98 47 160 47 C222 47 269 64 268 135 L268 171 C268 211 243 236 205 246 L160 269 L115 246 C77 236 52 211 52 171Z" fill="#d6d8df" opacity=".22" filter="url(#soft)"/>
<path d="M52 130 C52 67 94 48 160 48 C226 48 268 67 268 130 L268 169 C268 206 246 230 210 240 L160 262 L110 240 C74 230 52 206 52 169Z" fill="url(#face)" stroke="#edf0f3" stroke-width="1.5"/>
<circle cx="109" cy="159" r="7.7" fill="#292b30"/>
<circle cx="211" cy="159" r="7.7" fill="#292b30"/>
<rect x="153.5" y="171" width="13" height="5" rx="2.5" fill="#2d2e33"/>
<!-- The hoodie is symmetric; the collar is layered over both shoulders. -->
<path d="M29 338 L29 320 C29 283 68 263 114 251 L160 274 L206 251 C252 263 291 283 291 320 L291 338Z" fill="url(#shirt)" stroke="#e8741a" stroke-width="2"/>
<path d="M110 242 C126 258 144 266 160 268 C176 266 194 258 210 242 L235 262 C215 293 191 307 160 308 C129 307 105 293 85 262Z" fill="#ff9b39" stroke="#ec7a1e" stroke-width="2"/>
<path d="M105 257 C120 275 140 284 160 285 C180 284 200 275 215 257" stroke="#e77719" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M117 286 L112 338 M203 286 L208 338" fill="none" stroke="#e37b21" stroke-width="4" stroke-linecap="round" opacity=".75"/>
</svg>`;
export const mascotVectorUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
