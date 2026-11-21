// 24px 선 아이콘(두께 1.8). 색은 부모의 currentColor를 따릅니다. 장식용이라 스크린리더에서는 숨깁니다.
const PATHS = {
  home: 'M3.5 11 12 3.5 20.5 11V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z',
  doc: 'M6.5 3h8l4 4v14h-12z M14 3v5h4.5 M9.5 13h5 M9.5 17h5',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 18v3',
  user: 'M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 21a7.5 7.5 0 0 1 15 0',
  building: 'M5.5 21V4h9v17 M14.5 9h4v12 M3.5 21h17 M8.5 8h2 M8.5 12h2 M8.5 16h2',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  check: 'M6 12.5l4 4 8-9',
  back: 'M15 5l-7 7 7 7',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4z M12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  phone: 'M7 3h3l1.5 4-2 1.5a14 14 0 0 0 6 6l1.5-2 4 1.5v3c0 2-1.5 4-4 4C9.5 21 3 14.5 3 7c0-2.5 2-4 4-4z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  menu: 'M5 7h14 M5 12h14 M5 17h9',
  download: 'M12 3v12 M7.5 11l4.5 4.5 4.5-4.5 M5 20h14',
  mobile: 'M7 2.5h10v19H7z M11 18.5h2',
  chevron: 'M9 5l7 7-7 7',
};

export function icon(name, size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of PATHS[name].split(' M')) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d.startsWith('M') ? d : `M${d}`);
    svg.append(path);
  }
  return svg;
}
