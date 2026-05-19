export interface TabColor {
  h: number;
  s: number;
  l: number;
}

function hsl(c: TabColor): string {
  return `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
}

const PALETTE: TabColor[] = [
  { h: 210, s: 65, l: 52 }, // blue
  { h: 150, s: 55, l: 45 }, // green
  { h: 25, s: 75, l: 48 },  // orange
  { h: 330, s: 60, l: 52 }, // pink
  { h: 270, s: 50, l: 48 }, // purple
  { h: 180, s: 55, l: 42 }, // teal
  { h: 0, s: 60, l: 48 },   // red
  { h: 50, s: 75, l: 45 },  // yellow
];

interface TabInfo {
  projectPath: string | null;
  color: TabColor;
}

export function assignTabColor(projectPath: string | null, existingTabs: TabInfo[]): TabColor {
  if (projectPath) {
    const sameProject = existingTabs.filter((t) => t.projectPath === projectPath);
    if (sameProject.length > 0) {
      const base = sameProject[0].color;
      const newL = Math.min(82, base.l + sameProject.length * 13);
      return { h: base.h, s: base.s, l: newL };
    }
    const usedHues = new Set(
      existingTabs.filter((t) => t.projectPath !== null).map((t) => t.color.h)
    );
    const fresh = PALETTE.find((c) => !usedHues.has(c.h));
    if (fresh) return { ...fresh };
    const idx = existingTabs.filter((t) => t.projectPath !== null).length % PALETTE.length;
    const base = PALETTE[idx];
    return { h: (base.h + 15) % 360, s: base.s, l: base.l };
  }
  const noProject = existingTabs.filter((t) => t.projectPath === null);
  return { h: 0, s: 0, l: 40 + noProject.length * 12 };
}

export function tabColorCSS(color: TabColor): string {
  return hsl(color);
}

export function tabColorLightCSS(color: TabColor): string {
  return hsl({ h: color.h, s: color.s, l: Math.min(92, color.l + 30) });
}
